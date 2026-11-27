import { hash32 } from './phrases';
import { drawStudioShadow, drawStudioSurface } from './studio';
import { groupOfGrain, type GrainSet } from './units';
import type { AltFrame } from './coins';

const TOP_RESERVE = 64;
const BOTTOM_RESERVE = 122;
const SAMPLES = 220;

/** Paleta botánica desaturada para el modo «Capas por años» (h, s, l). */
const RING_LAYERS: ReadonlyArray<[number, number, number]> = [
  [33, 30, 50], // roble natural
  [18, 28, 45], // cedro seco
  [92, 18, 45], // liquen
  [182, 18, 44], // pizarra verdosa
  [38, 24, 58], // abedul pálido
  [212, 18, 48], // gris acero
  [352, 22, 48], // cerezo viejo
  [28, 24, 40], // nogal
];

/** Factor radial orgánico (1 ± ~6 %) para que los anillos parezcan madera real y no dianas geométricas. */
export function organicFactor(ringFrac: number, theta: number, seed: number): number {
  const amp = 0.015 + 0.055 * Math.pow(ringFrac, 0.85);
  const p2 = ((seed & 0xff) / 255) * Math.PI * 2;
  const p3 = (((seed >>> 8) & 0xff) / 255) * Math.PI * 2;
  const p5 = (((seed >>> 16) & 0xff) / 255) * Math.PI * 2;
  const p7 = (((seed >>> 24) & 0xff) / 255) * Math.PI * 2;
  const w =
    0.48 * Math.sin(2 * theta + p2) +
    0.28 * Math.sin(3 * theta + p3 + ringFrac * 0.5) +
    0.15 * Math.sin(5 * theta + p5 - ringFrac * 0.4) +
    0.09 * Math.sin(7 * theta + p7);
  return 1 + amp * w;
}

/**
 * Vista de sección transversal real de un tronco de madera para la unidad de «Años».
 * Cada anillo concéntrico (del corazón hacia la corteza) es un año de tu vida laboral:
 * madera natural cálida desaturada para los años ya vividos y sección tallada en contraste
 * neto (>= 3:1) para los años pendientes, con corteza orgánica, veta radial y luz de estudio.
 */
export class TreeView {
  dpr = 1;
  topExtra = 0;

  private ctx: CanvasRenderingContext2D;
  private cx = 0;
  private cy = 0;
  private maxR = 100;
  private seed: number;
  private isLight = false;
  /** Radios acumulados normalizados (0..1) del borde exterior de cada año `id`. */
  private outerFrac: Float32Array;
  private years: Int32Array;
  /** Anillos mostrados actualmente (interpolado con suavidad hacia `landed`). */
  private displayLanded = 0;
  private lastTime = 0;
  private ringPaths: Path2D[] = [];
  private barkPath = new Path2D();
  private barkRimPath = new Path2D();

  constructor(
    private canvas: HTMLCanvasElement,
    private grains: GrainSet,
    initialLanded: number,
    seed = 42,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.seed = hash32(seed * 2654435761 + grains.total);
    this.displayLanded = initialLanded;

    const n = Math.max(1, grains.total);
    this.outerFrac = new Float32Array(n);
    this.years = new Int32Array(n);
    // Cada año tiene un grosor ligeramente distinto (años secos y lluviosos).
    let sum = 0;
    const weights = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.years[i] = groupOfGrain(grains, i);
      const r = hash32(i * 48271 + this.seed);
      const w = 0.78 + 0.44 * ((r & 0xff) / 255);
      weights[i] = w;
      sum += w;
    }
    const coreFrac = 0.055;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += weights[i];
      this.outerFrac[i] = coreFrac + (1 - coreFrac) * (acc / sum);
    }

    this.refreshTheme();
    this.resize();
  }

  refreshTheme(): void {
    this.isLight = matchMedia('(prefers-color-scheme: light)').matches;
  }

  resize(cssW = window.innerWidth, cssH = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2)): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const top = (TOP_RESERVE + this.topExtra) * dpr;
    const bot = BOTTOM_RESERVE * dpr;
    const availW = (cssW - 32) * dpr;
    const availH = Math.max(120 * dpr, cssH * dpr - top - bot);
    this.cx = Math.round((cssW * dpr) / 2);
    this.cy = Math.round(top + availH * 0.49);
    this.maxR = Math.max(48 * dpr, Math.min(availW, availH) * 0.42);
    this.rebuildPaths();
  }

  /** Radio en píxeles de dispositivo de una fracción radial `f` en el ángulo `theta`. */
  private radAt(frac: number, theta: number): number {
    return this.maxR * frac * organicFactor(frac, theta, this.seed);
  }

  private buildOrganicPath(frac: number, barkRugged = false, offX = 0, offY = 0): Path2D {
    const p = new Path2D();
    for (let s = 0; s <= SAMPLES; s++) {
      const th = (s / SAMPLES) * Math.PI * 2;
      let r = this.radAt(frac, th);
      if (barkRugged) {
        // Relieve rugoso de corteza natural (grietas irregulares de varios armónicos).
        r +=
          this.maxR * 0.015 * Math.sin(17 * th + 0.7) +
          this.maxR * 0.009 * Math.cos(29 * th + 1.4) +
          this.maxR * 0.005 * Math.sin(43 * th);
      }
      const x = this.cx + offX + Math.cos(th) * r;
      const y = this.cy + offY + Math.sin(th) * r;
      if (s === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
    return p;
  }

  private rebuildPaths(): void {
    const n = this.outerFrac.length;
    this.ringPaths = new Array(n);
    for (let i = 0; i < n; i++) this.ringPaths[i] = this.buildOrganicPath(this.outerFrac[i]);
    this.barkPath = this.buildOrganicPath(1.068, true);
    // Canto inferior de la rodaja (da volumen físico bajo la luz clave superior-izquierda).
    this.barkRimPath = this.buildOrganicPath(1.068, true, 3.5 * this.dpr, 5.5 * this.dpr);
  }

  /** Sincroniza el avance (en modo sin animaciones salta directo). */
  notifyLanded(newLanded: number, reducedMotion: boolean): void {
    if (reducedMotion || newLanded < this.displayLanded) this.displayLanded = newLanded;
  }

  /** Devuelve el ID del año (anillo) bajo el puntero (coordenadas CSS), o -1. */
  pick(cssX: number, cssY: number): number {
    const dx = cssX * this.dpr - this.cx;
    const dy = cssY * this.dpr - this.cy;
    const dist = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx);
    if (dist > this.radAt(1.04, theta)) return -1;
    for (let i = 0; i < this.outerFrac.length; i++) {
      if (dist <= this.radAt(this.outerFrac[i], theta)) return i;
    }
    return this.outerFrac.length - 1;
  }

  /** Madera natural desaturada (roble / nogal) para los anillos vividos, con contraste >= 3:1 frente a pendientes. */
  private livedWoodColor(id: number, layersOn: boolean): string {
    const n = Math.max(1, this.outerFrac.length);
    if (layersOn) {
      const [h, s, l] = RING_LAYERS[this.years[id] % RING_LAYERS.length];
      return `hsl(${h}, ${s}%, ${this.isLight ? l - 4 : l + 2}%)`;
    }
    const frac = id / n;
    const r = hash32(id * 7919 + this.seed);
    const jitter = ((r & 0xff) / 255 - 0.5) * 5;
    // Roble natural desaturado: corazón ligeramente más tostado, anillos exteriores algo más claros.
    const h = 31 + frac * 5 + jitter * 0.35;
    const s = (this.isLight ? 26 : 27) + frac * 5;
    const l = (this.isLight ? 44 : 46) + frac * 11 + jitter * 0.55;
    return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
  }

  /** Madera seca/albura oscurecida en contraste claro (>= 3:1) para los anillos pendientes. */
  private pendingWoodColor(id: number): string {
    const n = Math.max(1, this.outerFrac.length);
    const frac = id / n;
    const r = hash32(id * 104729 + this.seed);
    const jitter = ((r & 0xff) / 255 - 0.5) * 2.4;
    if (this.isLight) {
      const l = 84 - frac * 5 + jitter;
      return `hsl(34, 14%, ${l.toFixed(1)}%)`;
    }
    const l = 15.5 + frac * 2.5 + jitter * 0.45;
    return `hsl(30, 12%, ${l.toFixed(1)}%)`;
  }

  draw(f: AltFrame): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Interpolar crecimiento de anillos con suavidad.
    const dt = this.lastTime > 0 ? Math.min(50, f.time - this.lastTime) : 16;
    this.lastTime = f.time;
    if (f.reducedMotion) this.displayLanded = f.landed;
    else if (Math.abs(f.landed - this.displayLanded) < 0.02) this.displayLanded = f.landed;
    else this.displayLanded += (f.landed - this.displayLanded) * Math.min(1, dt / 120);

    const n = this.outerFrac.length;
    const earnedCount = Math.min(n, Math.round(this.displayLanded));
    const focusId = f.selected >= 0 ? f.selected : f.hovered;
    const milestoneSet = new Set(f.milestoneIds);

    // 1. Plano de estudio común y sombra de contacto direccional coherente (luz arriba-izquierda).
    const baseY = this.cy + this.maxR * 1.04;
    drawStudioSurface(ctx, W, H, baseY - this.maxR * 0.16, this.cx, this.maxR * 1.12, this.isLight);
    drawStudioShadow(ctx, this.cx, baseY + 5 * this.dpr, this.maxR * 0.96, this.maxR * 0.16, this.isLight, 0.92);

    // 2. Canto físico inferior de la rodaja de madera + corteza orgánica rugosa siempre visible.
    ctx.save();
    ctx.fillStyle = this.isLight ? '#4f4338' : '#120f0d';
    ctx.fill(this.barkRimPath);

    const barkGrad = ctx.createLinearGradient(
      this.cx - this.maxR,
      this.cy - this.maxR,
      this.cx + this.maxR,
      this.cy + this.maxR,
    );
    if (this.isLight) {
      barkGrad.addColorStop(0, '#6c5a49');
      barkGrad.addColorStop(0.55, '#524335');
      barkGrad.addColorStop(1, '#3b2f25');
    } else {
      barkGrad.addColorStop(0, '#4a3d32');
      barkGrad.addColorStop(0.45, '#332a22');
      barkGrad.addColorStop(1, '#1d1814');
    }
    ctx.fillStyle = barkGrad;
    ctx.fill(this.barkPath);

    // Grietas radiales en la franja de la corteza exterior.
    ctx.save();
    ctx.clip(this.barkPath);
    ctx.strokeStyle = this.isLight ? 'rgba(32, 24, 18, 0.35)' : 'rgba(10, 8, 6, 0.58)';
    ctx.lineWidth = Math.max(0.9, 1.1 * this.dpr);
    const fissures = 52;
    for (let k = 0; k < fissures; k++) {
      const th = (k / fissures) * Math.PI * 2 + (((hash32(k * 97 + this.seed) & 0xff) / 255) - 0.5) * 0.08;
      const r0 = this.radAt(0.995, th);
      const r1 = this.radAt(1.08, th);
      ctx.beginPath();
      ctx.moveTo(this.cx + Math.cos(th) * r0, this.cy + Math.sin(th) * r0);
      ctx.lineTo(this.cx + Math.cos(th) * r1, this.cy + Math.sin(th) * r1);
      ctx.stroke();
    }
    ctx.restore();

    // Filo iluminado arriba-izquierda en el contorno de la corteza.
    const barkEdge = ctx.createLinearGradient(
      this.cx - this.maxR,
      this.cy - this.maxR,
      this.cx + this.maxR,
      this.cy + this.maxR,
    );
    barkEdge.addColorStop(0, this.isLight ? 'rgba(255, 246, 232, 0.45)' : 'rgba(170, 152, 130, 0.34)');
    barkEdge.addColorStop(0.5, this.isLight ? 'rgba(60, 48, 36, 0.28)' : 'rgba(92, 78, 64, 0.24)');
    barkEdge.addColorStop(1, this.isLight ? 'rgba(32, 24, 18, 0.45)' : 'rgba(8, 6, 5, 0.72)');
    ctx.strokeStyle = barkEdge;
    ctx.lineWidth = Math.max(1.2, 1.5 * this.dpr);
    ctx.stroke(this.barkPath);
    ctx.restore();

    // 3. Anillos pendientes (madera seca/oscura con líneas claras de crecimiento, contraste >= 3:1).
    const pendingLine = this.isLight ? 'rgba(92, 76, 58, 0.42)' : 'rgba(182, 170, 152, 0.42)';
    for (let i = n - 1; i >= earnedCount; i--) {
      const cut = f.cutoff >= 0 && i >= f.cutoff;
      ctx.save();
      if (cut) ctx.globalAlpha = 0.28;
      ctx.fillStyle = this.pendingWoodColor(i);
      ctx.fill(this.ringPaths[i]);
      ctx.lineWidth = Math.max(0.85, 0.95 * this.dpr);
      ctx.strokeStyle = pendingLine;
      ctx.stroke(this.ringPaths[i]);
      ctx.restore();
    }

    // 4. Anillos ya vividos (duramen natural de roble/nogal desaturado con veta de madera tardía).
    for (let i = earnedCount - 1; i >= 0; i--) {
      const cut = f.cutoff >= 0 && i >= f.cutoff;
      const dimLayer = f.layersOn && focusId >= 0 && i !== focusId;
      ctx.save();
      if (cut) ctx.globalAlpha = 0.25;
      else if (dimLayer) ctx.globalAlpha = 0.35;

      ctx.fillStyle = this.livedWoodColor(i, f.layersOn);
      ctx.fill(this.ringPaths[i]);

      // Línea oscura de crecimiento anual (madera tardía).
      ctx.lineWidth = Math.max(0.95, 1.15 * this.dpr);
      ctx.strokeStyle = this.isLight ? 'rgba(46, 30, 16, 0.48)' : 'rgba(26, 18, 11, 0.56)';
      ctx.stroke(this.ringPaths[i]);
      ctx.restore();
    }

    // 5. Textura orgánica de madera sobre toda la sección: radios medulares, grietas de secado y médula.
    ctx.save();
    ctx.clip(this.ringPaths[n - 1]);

    // Radios medulares finos atravesando toda la sección del tronco.
    ctx.lineWidth = Math.max(0.75, 0.85 * this.dpr);
    const rays = 36;
    for (let r = 0; r < rays; r++) {
      const h = hash32(r * 131 + this.seed);
      const th = (r / rays) * Math.PI * 2 + (((h & 0xff) / 255) - 0.5) * 0.1;
      const len = this.maxR * (0.72 + 0.35 * (((h >>> 8) & 0xff) / 255));
      ctx.strokeStyle = this.isLight ? 'rgba(54, 38, 22, 0.08)' : 'rgba(220, 206, 184, 0.065)';
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.lineTo(this.cx + Math.cos(th) * len, this.cy + Math.sin(th) * len);
      ctx.stroke();
    }

    // Dos pequeñas fendas naturales de secado que nacen del corazón (madera real).
    if (earnedCount > 2) {
      const crackR = this.radAt(this.outerFrac[Math.min(earnedCount - 1, Math.max(2, Math.floor(earnedCount * 0.72)))], 0);
      ctx.strokeStyle = this.isLight ? 'rgba(42, 28, 16, 0.34)' : 'rgba(18, 13, 8, 0.54)';
      ctx.lineCap = 'round';
      for (let c = 0; c < 3; c++) {
        const hc = hash32(c * 499 + this.seed);
        const th = ((hc & 0xffff) / 65535) * Math.PI * 2;
        const len = crackR * (0.45 + 0.42 * (((hc >>> 16) & 0xff) / 255));
        const midTh = th + (((hc >>> 24) & 0xff) / 255 - 0.5) * 0.08;
        ctx.lineWidth = Math.max(0.9, (1.15 - c * 0.18) * this.dpr);
        ctx.beginPath();
        ctx.moveTo(this.cx, this.cy);
        ctx.quadraticCurveTo(
          this.cx + Math.cos(midTh) * len * 0.5,
          this.cy + Math.sin(midTh) * len * 0.5,
          this.cx + Math.cos(th) * len,
          this.cy + Math.sin(th) * len,
        );
        ctx.stroke();
      }
    }

    // Corazón (médula) del árbol.
    if (earnedCount > 0) {
      ctx.fillStyle = this.isLight ? '#4f3620' : '#3a2819';
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, Math.max(2.6 * this.dpr, this.maxR * 0.024), 0, Math.PI * 2);
      ctx.fill();
    }

    // Iluminación direccional de estudio sobre la cara cortada (key light arriba-izquierda).
    const faceLight = ctx.createLinearGradient(
      this.cx - this.maxR,
      this.cy - this.maxR,
      this.cx + this.maxR,
      this.cy + this.maxR,
    );
    if (this.isLight) {
      faceLight.addColorStop(0, 'rgba(255, 252, 246, 0.22)');
      faceLight.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
      faceLight.addColorStop(1, 'rgba(36, 26, 16, 0.16)');
    } else {
      faceLight.addColorStop(0, 'rgba(250, 244, 232, 0.13)');
      faceLight.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
      faceLight.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    }
    ctx.fillStyle = faceLight;
    ctx.fillRect(this.cx - this.maxR * 1.15, this.cy - this.maxR * 1.15, this.maxR * 2.3, this.maxR * 2.3);
    ctx.restore();

    // 6. Límite nítido del año en curso (cámbium limpio en latón/albura clara, sin glow neón).
    if (earnedCount > 0 && earnedCount < n) {
      ctx.save();
      ctx.lineWidth = Math.max(1.6, 1.9 * this.dpr);
      ctx.strokeStyle = this.isLight ? '#7c6036' : '#d2bc93';
      ctx.stroke(this.ringPaths[earnedCount - 1]);
      ctx.restore();
    }

    // 7. Línea discontinua de corte si está abierto «¿Y si me jubilo a otra edad?».
    if (f.cutoff > 0 && f.cutoff < n) {
      ctx.save();
      ctx.setLineDash([5 * this.dpr, 4 * this.dpr]);
      ctx.lineWidth = 1.6 * this.dpr;
      ctx.strokeStyle = this.isLight ? '#8f7242' : '#c7b084';
      ctx.stroke(this.ringPaths[f.cutoff - 1]);
      ctx.restore();
    }

    // 8. Hitos próximos: marcador sobrio en latón envejecido (sin brillo neón).
    if (milestoneSet.size > 0) {
      for (const mid of milestoneSet) {
        if (mid < 0 || mid >= n || (f.cutoff >= 0 && mid >= f.cutoff)) continue;
        const fIn = mid === 0 ? 0.03 : this.outerFrac[mid - 1];
        const fMid = (fIn + this.outerFrac[mid]) * 0.5;
        const th = -Math.PI / 2 + ((mid * 2.39996) % (Math.PI * 2));
        const rr = this.radAt(fMid, th);
        const mx = this.cx + Math.cos(th) * rr;
        const my = this.cy + Math.sin(th) * rr;

        ctx.save();
        ctx.strokeStyle = this.isLight ? 'rgba(130, 102, 58, 0.45)' : 'rgba(196, 173, 130, 0.36)';
        ctx.lineWidth = 1.1 * this.dpr;
        ctx.stroke(this.ringPaths[mid]);

        ctx.fillStyle = this.isLight ? '#8f7242' : '#d6c29d';
        ctx.beginPath();
        ctx.arc(mx, my, 2.5 * this.dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = this.isLight ? 'rgba(255, 255, 255, 0.75)' : 'rgba(12, 13, 15, 0.85)';
        ctx.lineWidth = 1 * this.dpr;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 9. Resaltado del anillo señalado o seleccionado (banda completa entre anillo interior y exterior).
    if (focusId >= 0 && focusId < n) {
      ctx.save();
      const band = new Path2D();
      band.addPath(this.ringPaths[focusId]);
      if (focusId > 0) band.addPath(this.ringPaths[focusId - 1]);
      ctx.fillStyle = this.isLight ? 'rgba(143, 114, 66, 0.32)' : 'rgba(196, 173, 130, 0.28)';
      ctx.fill(band, 'evenodd');
      ctx.lineWidth = Math.max(1.6, 1.9 * this.dpr);
      ctx.strokeStyle = this.isLight ? '#785e36' : '#dfd0b2';
      ctx.stroke(this.ringPaths[focusId]);
      ctx.restore();
    }

    // 10. Etiquetas discretas del año de jubilación (arriba) y año señalado (abajo).
    ctx.save();
    ctx.font = `500 ${Math.max(10, Math.round(11 * this.dpr))}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.isLight ? 'rgba(42, 38, 32, 0.62)' : 'rgba(220, 216, 208, 0.48)';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(this.years[n - 1]), this.cx, this.cy - this.maxR * 1.12);
    if (focusId >= 0 && focusId < n) {
      ctx.fillStyle = this.isLight ? '#785e36' : '#c7b084';
      ctx.textBaseline = 'top';
      ctx.fillText(`Año ${this.years[focusId]}`, this.cx, this.cy + this.maxR * 1.12);
    }
    ctx.restore();
  }

  /** Instantánea para la tarjeta de compartir. */
  snapshot(width: number, height: number, frame: AltFrame): { canvas: HTMLCanvasElement } {
    const canvas = document.createElement('canvas');
    const view = new TreeView(canvas, this.grains, frame.landed, this.seed);
    view.resize(width, height, 1);
    view.draw({ ...frame, selected: -1, hovered: -1 });
    return { canvas };
  }
}
