import { hash32 } from './phrases';
import { groupOfGrain, type GrainSet } from './units';
import type { AltFrame } from './coins';

const TOP_RESERVE = 64;
const BOTTOM_RESERVE = 114;
const SAMPLES = 96;

/** Paleta botánica cálida para el modo «Capas por años» (h, s, l). */
const RING_LAYERS: ReadonlyArray<[number, number, number]> = [
  [34, 58, 56], // roble dorado
  [18, 52, 48], // cedro
  [88, 28, 48], // musgo
  [172, 32, 46], // salvia azulada
  [44, 52, 68], // abedul
  [212, 34, 54], // pizarra
  [350, 38, 56], // cerezo
  [28, 44, 42], // nogal
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
 * Vista de sección transversal de un tronco de árbol para la unidad de «Años».
 * Cada anillo concéntrico (del corazón hacia la corteza) es un año de tu vida laboral:
 * madera viva para los ya trabajados, anillos translúcidos para los que faltan.
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
    // Cada año tiene un grosor ligeramente distinto (como años secos/lluviosos en un árbol real).
    let sum = 0;
    const weights = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.years[i] = groupOfGrain(grains, i);
      const r = hash32(i * 48271 + this.seed);
      const w = 0.8 + 0.4 * ((r & 0xff) / 255);
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

  resize(cssW = window.innerWidth, cssH = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 3)): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const top = (TOP_RESERVE + this.topExtra) * dpr;
    const bot = BOTTOM_RESERVE * dpr;
    const availW = (cssW - 32) * dpr;
    const availH = Math.max(120 * dpr, cssH * dpr - top - bot);
    this.cx = Math.round((cssW * dpr) / 2);
    this.cy = Math.round(top + availH / 2);
    this.maxR = Math.max(48 * dpr, Math.min(availW, availH) * 0.43);
    this.rebuildPaths();
  }

  /** Radio en píxeles de dispositivo de una fracción radial `f` en el ángulo `theta`. */
  private radAt(frac: number, theta: number): number {
    return this.maxR * frac * organicFactor(frac, theta, this.seed);
  }

  private buildOrganicPath(frac: number, barkRugged = false): Path2D {
    const p = new Path2D();
    for (let s = 0; s <= SAMPLES; s++) {
      const th = (s / SAMPLES) * Math.PI * 2;
      let r = this.radAt(frac, th);
      if (barkRugged) {
        // Relieve rugoso sutil en la corteza exterior.
        r += this.maxR * 0.014 * Math.sin(19 * th + 0.7) + this.maxR * 0.008 * Math.cos(31 * th);
      }
      const x = this.cx + Math.cos(th) * r;
      const y = this.cy + Math.sin(th) * r;
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
    this.barkPath = this.buildOrganicPath(1.065, true);
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

  /** Color cálido de madera natural (duramen oscuro en el centro → albura dorada fuera). */
  private woodColor(id: number, layersOn: boolean): string {
    const n = Math.max(1, this.outerFrac.length);
    if (layersOn) {
      const [h, s, l] = RING_LAYERS[this.years[id] % RING_LAYERS.length];
      return `hsl(${h}, ${s}%, ${this.isLight ? l - 4 : l}%)`;
    }
    const frac = id / n;
    const r = hash32(id * 7919 + this.seed);
    const jitter = ((r & 0xff) / 255 - 0.5) * 6;
    // De cedro tostado en el corazón a roble miel / dorado hacia el exterior.
    const h = 28 + frac * 11 + jitter * 0.4;
    const s = (this.isLight ? 48 : 52) + frac * 10;
    const l = (this.isLight ? 44 : 36) + frac * 24 + jitter * 0.6;
    return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
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

    // 1. Halo ambiental cálido + sombra proyectada suave bajo el tronco.
    const halo = ctx.createRadialGradient(this.cx, this.cy, this.maxR * 0.15, this.cx, this.cy, this.maxR * 1.45);
    halo.addColorStop(0, this.isLight ? 'rgba(215, 160, 75, 0.22)' : 'rgba(236, 184, 96, 0.14)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = this.isLight ? 'rgba(30, 22, 12, 0.22)' : 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 36 * this.dpr;
    ctx.shadowOffsetY = 12 * this.dpr;
    ctx.fillStyle = this.isLight ? 'rgba(110, 78, 48, 0.14)' : 'rgba(20, 26, 40, 0.55)';
    ctx.fill(this.barkPath);
    ctx.restore();

    // 2. Corteza exterior (sólida si ya se jubiló; translúcida/tallada mientras quedan años).
    ctx.save();
    ctx.fillStyle =
      earnedCount >= n
        ? this.isLight
          ? '#4f3520'
          : '#382517'
        : this.isLight
          ? 'rgba(92, 66, 42, 0.16)'
          : 'rgba(180, 206, 245, 0.06)';
    ctx.fill(this.barkPath);
    ctx.lineWidth = Math.max(1.5, 2 * this.dpr);
    ctx.strokeStyle =
      earnedCount >= n
        ? this.isLight
          ? '#2e1d10'
          : '#6b482d'
        : this.isLight
          ? 'rgba(92, 66, 42, 0.32)'
          : 'rgba(210, 228, 255, 0.22)';
    ctx.stroke(this.barkPath);
    ctx.restore();

    // 3. Anillos futuros (del exterior hacia el interior: siluetas cristal/madera esperando crecer).
    const futureLine = this.isLight ? 'rgba(72, 60, 48, 0.2)' : 'rgba(210, 228, 255, 0.14)';
    const futureFill = this.isLight ? 'rgba(255, 252, 246, 0.55)' : 'rgba(18, 24, 38, 0.72)';
    for (let i = n - 1; i >= earnedCount; i--) {
      const cut = f.cutoff >= 0 && i >= f.cutoff;
      ctx.save();
      if (cut) ctx.globalAlpha = 0.25;
      ctx.fillStyle = futureFill;
      ctx.fill(this.ringPaths[i]);
      ctx.lineWidth = Math.max(0.9, 1 * this.dpr);
      ctx.strokeStyle = futureLine;
      ctx.stroke(this.ringPaths[i]);
      ctx.restore();
    }

    // 4. Anillos ya trabajados (madera cálida viva, del exterior hacia el corazón).
    for (let i = earnedCount - 1; i >= 0; i--) {
      const cut = f.cutoff >= 0 && i >= f.cutoff;
      const dimLayer = f.layersOn && focusId >= 0 && i !== focusId;
      ctx.save();
      if (cut) ctx.globalAlpha = 0.25;
      else if (dimLayer) ctx.globalAlpha = 0.35;

      ctx.fillStyle = this.woodColor(i, f.layersOn);
      ctx.fill(this.ringPaths[i]);

      // Línea oscura de crecimiento anual (madera tardía) que separa limpiamente cada año.
      ctx.lineWidth = Math.max(0.9, 1.15 * this.dpr);
      ctx.strokeStyle = this.isLight ? 'rgba(54, 30, 12, 0.42)' : 'rgba(18, 10, 4, 0.48)';
      ctx.stroke(this.ringPaths[i]);
      ctx.restore();
    }

    // 5. Radios medulares sutiles (vetas radiales orgánicas dentro de la parte viva).
    if (earnedCount > 0) {
      ctx.save();
      ctx.clip(this.ringPaths[earnedCount - 1]);
      ctx.strokeStyle = this.isLight ? 'rgba(65, 36, 14, 0.08)' : 'rgba(255, 226, 168, 0.07)';
      ctx.lineWidth = Math.max(0.8, 0.9 * this.dpr);
      const rays = 24;
      for (let r = 0; r < rays; r++) {
        const th = (r / rays) * Math.PI * 2 + (((hash32(r + this.seed) & 0xff) / 255) - 0.5) * 0.14;
        ctx.beginPath();
        ctx.moveTo(this.cx, this.cy);
        ctx.lineTo(this.cx + Math.cos(th) * this.maxR * 1.1, this.cy + Math.sin(th) * this.maxR * 1.1);
        ctx.stroke();
      }
      // Corazón (médula) del árbol.
      ctx.fillStyle = this.isLight ? '#5c3618' : '#4a2910';
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, Math.max(2.5 * this.dpr, this.maxR * 0.025), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 6. Borde de crecimiento activo (cámbium dorado que late suavemente).
    if (earnedCount > 0 && earnedCount < n) {
      const pulse = f.reducedMotion ? 0.7 : 0.45 + 0.45 * Math.sin(f.time / 700);
      ctx.save();
      ctx.lineWidth = Math.max(2, 2.6 * this.dpr);
      ctx.strokeStyle = this.isLight ? `rgba(195, 125, 20, ${pulse})` : `rgba(255, 214, 128, ${pulse})`;
      ctx.shadowColor = 'rgba(255, 204, 110, 0.75)';
      ctx.shadowBlur = 10 * this.dpr;
      ctx.stroke(this.ringPaths[earnedCount - 1]);
      ctx.restore();
    }

    // 7. Línea discontinua de corte si está abierto «¿Y si me jubilo a otra edad?».
    if (f.cutoff > 0 && f.cutoff < n) {
      ctx.save();
      ctx.setLineDash([5 * this.dpr, 4 * this.dpr]);
      ctx.lineWidth = 1.8 * this.dpr;
      ctx.strokeStyle = this.isLight ? '#b3741a' : '#f0c475';
      ctx.stroke(this.ringPaths[f.cutoff - 1]);
      ctx.restore();
    }

    // 8. Hitos próximos: pequeño brillo estelar sobre su anillo.
    if (milestoneSet.size > 0) {
      const pulse = f.reducedMotion ? 0.85 : 0.5 + 0.45 * Math.sin(f.time / 550);
      for (const mid of milestoneSet) {
        if (mid < 0 || mid >= n || (f.cutoff >= 0 && mid >= f.cutoff)) continue;
        const fIn = mid === 0 ? 0.03 : this.outerFrac[mid - 1];
        const fMid = (fIn + this.outerFrac[mid]) * 0.5;
        const th = -Math.PI / 2 + ((mid * 2.39996) % (Math.PI * 2)); // ángulo áureo
        const rr = this.radAt(fMid, th);
        const mx = this.cx + Math.cos(th) * rr;
        const my = this.cy + Math.sin(th) * rr;

        ctx.save();
        ctx.strokeStyle = this.isLight ? `rgba(190, 120, 20, ${pulse * 0.45})` : `rgba(255, 214, 128, ${pulse * 0.42})`;
        ctx.lineWidth = 1.2 * this.dpr;
        ctx.stroke(this.ringPaths[mid]);
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, 9 * this.dpr);
        g.addColorStop(0, `rgba(255, 232, 158, ${pulse})`);
        g.addColorStop(1, 'rgba(255, 210, 120, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(mx, my, 9 * this.dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff9d6';
        ctx.beginPath();
        ctx.arc(mx, my, 2.2 * this.dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 9. Resaltado del anillo señalado o seleccionado (banda completa entre anillo interior y exterior).
    if (focusId >= 0 && focusId < n) {
      ctx.save();
      const band = new Path2D();
      band.addPath(this.ringPaths[focusId]);
      if (focusId > 0) band.addPath(this.ringPaths[focusId - 1]);
      ctx.fillStyle = this.isLight ? 'rgba(214, 145, 32, 0.38)' : 'rgba(255, 218, 138, 0.34)';
      ctx.fill(band, 'evenodd');
      ctx.lineWidth = Math.max(1.8, 2.2 * this.dpr);
      ctx.strokeStyle = this.isLight ? '#9c6212' : '#ffe39e';
      ctx.stroke(this.ringPaths[focusId]);
      ctx.restore();
    }

    // 10. Etiquetas discretas del año de inicio (centro) y año de jubilación (borde superior).
    ctx.save();
    ctx.font = `600 ${Math.max(10, Math.round(11 * this.dpr))}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.isLight ? 'rgba(55, 45, 35, 0.65)' : 'rgba(215, 228, 250, 0.55)';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(this.years[n - 1]), this.cx, this.cy - this.maxR * 1.11);
    if (focusId >= 0 && focusId < n) {
      ctx.fillStyle = this.isLight ? '#9c6212' : '#f0c475';
      ctx.textBaseline = 'top';
      ctx.fillText(`Año ${this.years[focusId]}`, this.cx, this.cy + this.maxR * 1.11);
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
