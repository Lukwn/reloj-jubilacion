import { profileHalf, type Hourglass } from './hourglass';
import { hash32 } from './phrases';
import type { GrainSim } from './sim';
import { agedBrassGradient, drawStudioShadow, drawStudioSurface, gunmetalGradient, studioPalette } from './studio';

export interface Point {
  x: number; // coordenadas de rejilla (celdas, admite decimales)
  y: number;
}

export interface HeroDraw extends Point {
  color: string;
  glow: number; // 0..1
  /** Radio exacto de la canica que cae (en celdas), si aplica. */
  rad?: number;
}

export interface DrawFrame {
  time: number;
  heroes: HeroDraw[];
  today: Point | null;
  selected: Point | null;
  /** Grupo (año) que se resalta atenuando los demás, o -1. */
  highlight: number;
  /** Los granos con id >= cutoff se ven casi transparentes («¿y si me jubilo antes?»), o -1. */
  cutoff: number;
  /** Granos que marcan un hito: brillan un poco. */
  marks: Point[];
  /** Dedo removiendo la arena (radio en celdas). */
  finger: (Point & { r: number }) | null;
  /** Giro del reloj en pantalla, en radianes y en sentido horario (inclinarlo con el ratón). */
  rotation?: number;
  /** Lupa: posición del ratón en CSS y grano que se recuadra (celda en la rejilla). */
  lens?: { x: number; y: number; grain: Point | null } | null;
}

interface Theme {
  glassFill: string;
  glassEdge: string;
  glassShine: string;
  glassRim: string;
  cap: string;
  cap2: string;
  capEdge: string;
  capShine: string;
  glow: string;
  bg: string;
  shadow: string;
  ambient: string;
  ambientCool: string;
  isLight: boolean;
}

/** Radio de la lupa en píxeles CSS. */
export const LENS_RADIUS = 64;

const TOP_RESERVE = 62;
const BOTTOM_RESERVE = 134;
const CAP_CSS = 22;
/** Ancho total del soporte arquitectónico respecto al vidrio. */
const FRAME_SPAN = 1.24;

interface ShineCurve {
  path: Path2D;
  width: number;
  y0: number;
  y1: number;
  alpha: number;
  warm?: boolean;
}

export class Renderer {
  /** Tamaño de celda en píxeles de dispositivo y origen de la rejilla. */
  s = 1;
  ox = 0;
  oy = 0;
  dpr = 1;

  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private buf: Uint32Array;
  private glassOuter = new Path2D();
  private glassInner = new Path2D();
  private glassWallBand = new Path2D();
  private theme!: Theme;
  private dim: Uint32Array | null = null;
  /** Espacio extra arriba (px CSS), para el panel de reproducción. Tras cambiarlo hay que llamar a `resize`. */
  topExtra = 0;
  /** Giro y escala con los que se dibujó el último fotograma, para deshacerlos al tocar. */
  private rot = 0;
  private rotScale = 1;
  private groupOf: Uint16Array | null = null;

  /** Brillos curvos tipo softbox que siguen la geometría de cada bulbo. */
  private shine: ShineCurve[] = [];
  /** Sombreado cilíndrico direccional 3D (×256) y micro-destellos de cuarzo por celda. */
  private relief: Uint16Array = new Uint16Array(0);
  private sparkle: Uint8Array = new Uint8Array(0);

  /** Los granos se dibujan como canicas redondas en vez de píxeles. */
  marbles = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private hg: Hourglass,
    private sim: GrainSim,
    private colors: Uint32Array,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.off = document.createElement('canvas');
    this.off.width = hg.W;
    this.off.height = hg.H;
    this.offCtx = this.off.getContext('2d')!;
    this.img = this.offCtx.createImageData(hg.W, hg.H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.buildSparkleMap();
    this.refreshTheme();
    this.resize();
  }

  /** Cambia la paleta. `dim` es la versión atenuada; con `groupOf` se puede resaltar un grupo. */
  setColors(colors: Uint32Array, dim: Uint32Array | null = null, groupOf: Uint16Array | null = null): void {
    this.colors = colors;
    this.dim = dim;
    this.groupOf = groupOf;
  }

  refreshTheme(): void {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    const isLight = matchMedia('(prefers-color-scheme: light)').matches;
    this.theme = {
      glassFill: v('--glass-fill') || (isLight ? 'rgba(255,255,255,0.28)' : 'rgba(175,212,255,0.04)'),
      glassEdge: v('--glass-edge') || (isLight ? 'rgba(24,38,60,0.28)' : 'rgba(205,228,255,0.28)'),
      glassShine: v('--glass-shine') || (isLight ? 'rgba(255,255,255,0.85)' : 'rgba(235,246,255,0.42)'),
      glassRim: v('--glass-rim') || (isLight ? 'rgba(255,255,255,0.5)' : 'rgba(200,228,255,0.14)'),
      cap: v('--cap') || (isLight ? '#cfd6e2' : '#1b2232'),
      cap2: v('--cap-2') || (isLight ? '#e8edf5' : '#35435e'),
      capEdge: v('--cap-edge') || (isLight ? 'rgba(25,38,60,0.2)' : 'rgba(220,236,255,0.24)'),
      capShine: v('--cap-shine') || (isLight ? 'rgba(255,255,255,0.75)' : 'rgba(240,248,255,0.26)'),
      glow: v('--glow') || '#ffe29c',
      bg: v('--bg-2') || (isLight ? '#f3f5f8' : '#0a0d14'),
      shadow: v('--shadow') || (isLight ? 'rgba(20,30,48,0.24)' : 'rgba(0,0,0,0.68)'),
      ambient: v('--ambient') || (isLight ? 'rgba(220,164,58,0.12)' : 'rgba(243,196,107,0.11)'),
      ambientCool: v('--ambient-cool') || (isLight ? 'rgba(92,148,220,0.1)' : 'rgba(100,152,255,0.08)'),
      isLight,
    };
  }

  resize(cssW = window.innerWidth, cssH = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 3)): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const { W, H } = this.hg;
    const availW = (cssW - 32) * dpr;
    const top = TOP_RESERVE + this.topExtra;
    const availH = Math.max(180 * dpr, (cssH - top - BOTTOM_RESERVE - CAP_CSS * 2) * dpr);
    this.s = Math.max(
      0.5,
      Math.min(availW / (W + 4), availW / ((this.hg.maxHalf + 0.8) * 2 * FRAME_SPAN), availH / H),
    );
    this.ox = Math.round((this.canvas.width - W * this.s) / 2);
    this.oy = Math.round((top + CAP_CSS) * dpr + (availH - H * this.s) / 2);
    this.marbles = this.sim.grainCount <= 5000 && this.s >= 6;
    this.buildGlassPaths();
    this.shine = this.buildShine();
    this.relief = this.buildRelief();
  }

  /** Semiancho exterior del vidrio a la altura y (en celdas), con garganta soplada orgánica. */
  private glassHalf(y: number): number {
    return profileHalf(this.hg, Math.max(0, Math.min(this.hg.H, y))) + 0.72;
  }

  /** Grosor óptico real de la pared de vidrio en píxeles de dispositivo (se engrosa en la cintura). */
  private wallThicknessPx(y: number): number {
    const { topEnd, bottomStart, H } = this.hg;
    const mid = (topEnd + bottomStart) * 0.5;
    const dist = Math.abs(y - mid) / Math.max(8, H * 0.14);
    const waistBoost = Math.exp(-(dist * dist)) * 1.45;
    const base = Math.max(2.2 * this.dpr, Math.min(4.6 * this.dpr, this.hg.maxHalf * this.s * 0.036));
    return base * (1 + waistBoost * 0.55);
  }

  /** Construye contorno exterior, pared interior y banda sólida de cristal (even-odd) para refracción real. */
  private buildGlassPaths(): void {
    const { H, W } = this.hg;
    const s = this.s;
    const cx = this.ox + (W / 2) * s;
    const n = Math.max(260, H * 6);
    const yAt = (y: number) => this.oy + y * s;

    const outer = new Path2D();
    for (let i = 0; i <= n; i++) {
      const y = (H * i) / n;
      const x = cx - this.glassHalf(y) * s;
      if (i === 0) outer.moveTo(x, yAt(y));
      else outer.lineTo(x, yAt(y));
    }
    for (let i = n; i >= 0; i--) {
      const y = (H * i) / n;
      outer.lineTo(cx + this.glassHalf(y) * s, yAt(y));
    }
    outer.closePath();

    const inner = new Path2D();
    for (let i = 0; i <= n; i++) {
      const y = (H * i) / n;
      const hw = Math.max(1.2 * this.dpr, this.glassHalf(y) * s - this.wallThicknessPx(y));
      const x = cx - hw;
      if (i === 0) inner.moveTo(x, yAt(y));
      else inner.lineTo(x, yAt(y));
    }
    for (let i = n; i >= 0; i--) {
      const y = (H * i) / n;
      const hw = Math.max(1.2 * this.dpr, this.glassHalf(y) * s - this.wallThicknessPx(y));
      inner.lineTo(cx + hw, yAt(y));
    }
    inner.closePath();

    // Banda sólida de pared de vidrio (exterior menos interior con fill('evenodd')).
    const band = new Path2D();
    band.addPath(outer);
    band.addPath(inner);

    this.glassOuter = outer;
    this.glassInner = inner;
    this.glassWallBand = band;
  }

  private buildShine(): ShineCurve[] {
    const { topEnd, bottomStart, H, W } = this.hg;
    const s = this.s;
    const cx = this.ox + (W / 2) * s;
    const out: ShineCurve[] = [];
    // Softbox principal a la izquierda, filo especular secundario y rebote cálido derecho.
    for (const [y0, y1] of [
      [topEnd * 0.06, topEnd * 0.86],
      [bottomStart + (H - bottomStart) * 0.14, H - (H - bottomStart) * 0.06],
    ]) {
      for (const [k, w, alpha, warm] of [
        [-0.76, 0.115, 0.95, false],
        [-0.56, 0.032, 0.48, false],
        [0.82, 0.048, 0.58, true],
      ] as const) {
        const p = new Path2D();
        const steps = 32;
        for (let i = 0; i <= steps; i++) {
          const y = y0 + ((y1 - y0) * i) / steps;
          const x = cx + k * this.glassHalf(y) * s;
          if (i === 0) p.moveTo(x, this.oy + y * s);
          else p.lineTo(x, this.oy + y * s);
        }
        out.push({
          path: p,
          width: Math.max(1.8 * this.dpr, this.hg.maxHalf * s * w),
          y0: this.oy + y0 * s,
          y1: this.oy + y1 * s,
          alpha,
          warm,
        });
      }
    }
    return out;
  }

  /** Sombreado cilíndrico 3D con luz principal desde arriba-izquierda + oclusión ambiental en vidrio. */
  private buildRelief(): Uint16Array {
    const { W, H, half, topEnd, bottomStart } = this.hg;
    const out = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) {
      const h = Math.max(1, half[y] + 0.5);
      // Profundidad vertical: leve oscurecimiento hacia la garganta y el fondo del bulbo inferior.
      let vertAO = 1;
      if (y < topEnd) {
        const t = y / Math.max(1, topEnd);
        vertAO = 1.04 - 0.14 * t * t;
      } else if (y >= bottomStart) {
        const t = (y - bottomStart) / Math.max(1, H - bottomStart);
        vertAO = 1.02 - 0.1 * t * t;
      }
      for (let x = 0; x < W; x++) {
        // nx ∈ [-1, 1]: -1 borde izquierdo, +1 borde derecho.
        const nx = Math.max(-1, Math.min(1, (x + 0.5 - W / 2) / h));
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx));
        // Luz clave estudio desde izquierda-frente (-0.42, 0.91) + leve rebote de contraluz derecha.
        const key = Math.max(0, -nx * 0.42 + nz * 0.91);
        const rimBounce = Math.pow(Math.max(0, nx), 3) * 0.14;
        // Oclusión suave junto a las paredes de cristal.
        const wallAO = 0.72 + 0.28 * Math.pow(nz, 0.55);
        const lit = (0.48 + 0.62 * key + rimBounce) * wallAO * vertAO;
        out[y * W + x] = Math.max(90, Math.min(310, Math.round(256 * lit)));
      }
    }
    return out;
  }

  /** Mapa determinista de micro-destellos de sílice/cuarzo para dar textura fina de arena mineral. */
  private buildSparkleMap(): void {
    const n = this.hg.W * this.hg.H;
    this.sparkle = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const h = hash32(i * 2654435761 + 97);
      // ~6 % de granos reflejan un brillo sutil de cuarzo.
      this.sparkle[i] = (h & 0x3f) < 4 ? 18 + ((h >>> 8) & 0x1f) : 0;
    }
  }

  private css = new Map<number, string>();
  private cssOf(c: number): string {
    let v = this.css.get(c);
    if (!v) {
      const a = (c >>> 24) / 255;
      v = `rgba(${c & 0xff},${(c >>> 8) & 0xff},${(c >>> 16) & 0xff},${a.toFixed(2)})`;
      this.css.set(c, v);
    }
    return v;
  }

  private grainRadius(): number {
    return this.marbles ? this.s * 0.46 : Math.max(1.35 * this.dpr, this.s * 0.68);
  }

  /** Dibuja la arena con suavizado fino (sin bloques pixelados bruscos) y oclusión ambiental en bordes. */
  private drawSand(ctx: CanvasRenderingContext2D): void {
    const { hg, s } = this;
    if (!this.marbles) {
      // Suavizado bilineal fino para que la arena parezca sílice real y no píxeles cuadrados.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.off, this.ox, this.oy, hg.W * s, hg.H * s);
      return;
    }
    const buf = this.buf;
    const r = s * 0.46;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (c === 0) continue;
      ctx.fillStyle = this.cssOf(c);
      ctx.beginPath();
      ctx.arc(this.ox + ((i % hg.W) + 0.5) * s, this.oy + (Math.floor(i / hg.W) + 0.5) * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Conecta orgánicamente la masa de arena superior con la garganta y el chorro que cae,
   * eliminando cualquier corte plano o aspecto de «pegote» aislado.
   */
  private drawNeckSandContinuity(f: DrawFrame): void {
    const { ctx, hg, s, dpr, sim } = this;
    const cx = this.ox + (hg.W / 2) * s;
    const neckTopY = this.oy + hg.topEnd * s;
    const neckBotY = this.oy + hg.bottomStart * s;
    const neckMidY = (neckTopY + neckBotY) * 0.5;

    // Comprobar si hay arena en el bulbo superior justo sobre el cuello.
    const rowAbove = Math.max(0, hg.topEnd - 1);
    let hasUpperSand = false;
    let sampleColor = 0;
    const midX = hg.W >> 1;
    for (let dx = -3; dx <= 3; dx++) {
      const idx = rowAbove * hg.W + midX + dx;
      const v = sim.grid[idx];
      if (v > 0) {
        hasUpperSand = true;
        sampleColor = this.colors[v - 1];
        break;
      }
    }
    if (!hasUpperSand && f.heroes.length === 0) return;

    const rC = sampleColor ? sampleColor & 0xff : 228;
    const gC = sampleColor ? (sampleColor >>> 8) & 0xff : 186;
    const bC = sampleColor ? (sampleColor >>> 16) & 0xff : 108;

    ctx.save();
    // 1. Embudo continuo de arena que se estrecha suavemente hasta el centro exacto de la boca.
    if (hasUpperSand) {
      const topW = Math.max(2.5 * dpr, (hg.half[rowAbove] + 0.4) * s);
      const tipW = Math.max(1.1 * dpr, this.glassHalf(hg.topEnd + 1) * s * 0.34);
      const tipY = f.heroes.length > 0 ? neckBotY + 1.5 * dpr : neckMidY + 1.2 * dpr;

      const funGrad = ctx.createLinearGradient(cx - topW, neckTopY - 2 * s, cx + topW, tipY);
      funGrad.addColorStop(0, `rgba(${Math.min(255, rC + 14)}, ${Math.min(255, gC + 12)}, ${Math.min(255, bC + 10)}, 0.96)`);
      funGrad.addColorStop(0.55, `rgba(${rC}, ${gC}, ${bC}, 0.95)`);
      funGrad.addColorStop(1, `rgba(${Math.round(rC * 0.68)}, ${Math.round(gC * 0.65)}, ${Math.round(bC * 0.6)}, 0.92)`);

      ctx.beginPath();
      ctx.moveTo(cx - topW, neckTopY - 1.2 * s);
      ctx.quadraticCurveTo(cx - topW * 0.55, neckTopY + (tipY - neckTopY) * 0.45, cx - tipW, tipY);
      ctx.quadraticCurveTo(cx, tipY + tipW * 1.15, cx + tipW, tipY);
      ctx.quadraticCurveTo(cx + topW * 0.55, neckTopY + (tipY - neckTopY) * 0.45, cx + topW, neckTopY - 1.2 * s);
      ctx.closePath();
      ctx.fillStyle = funGrad;
      ctx.fill();
    }

    // 2. Filamento dorado fino y cohesivo conectando los granos en caída con la garganta (nunca un punto suelto).
    if (f.heroes.length > 0) {
      let lowestY = neckMidY;
      for (const h of f.heroes) {
        const py = this.oy + h.y * s;
        if (py > lowestY) lowestY = py;
      }
      if (lowestY > neckMidY + 2 * dpr) {
        // Estela sutil de polvo dorado que fluye desde la punta del embudo hacia los granos cayendo.
        const streamGrad = ctx.createLinearGradient(cx, neckMidY, cx, lowestY);
        streamGrad.addColorStop(0, `rgba(${rC}, ${gC}, ${bC}, 0.72)`);
        streamGrad.addColorStop(0.65, `rgba(${rC}, ${gC}, ${bC}, 0.34)`);
        streamGrad.addColorStop(1, `rgba(${rC}, ${gC}, ${bC}, 0.08)`);
        ctx.strokeStyle = streamGrad;
        ctx.lineWidth = Math.max(1.1 * dpr, this.grainRadius() * 0.95);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, neckMidY);
        ctx.lineTo(cx, lowestY);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Centro del reloj en píxeles de dispositivo: el eje sobre el que gira. */
  private center(): Point {
    return { x: this.ox + (this.hg.W / 2) * this.s, y: this.oy + (this.hg.H / 2) * this.s };
  }

  /** Coordenadas CSS del puntero → coordenadas de rejilla (deshaciendo el giro, si lo hay). */
  toGrid(cssX: number, cssY: number): Point {
    let px = cssX * this.dpr;
    let py = cssY * this.dpr;
    if (this.rot !== 0) {
      const c = this.center();
      const dx = (px - c.x) / this.rotScale;
      const dy = (py - c.y) / this.rotScale;
      const cos = Math.cos(-this.rot);
      const sin = Math.sin(-this.rot);
      px = c.x + dx * cos - dy * sin;
      py = c.y + dx * sin + dy * cos;
    }
    return { x: (px - this.ox) / this.s, y: (py - this.oy) / this.s };
  }

  /** Coordenadas de rejilla → coordenadas CSS. */
  toCss(p: Point): Point {
    return { x: (this.ox + p.x * this.s) / this.dpr, y: (this.oy + p.y * this.s) / this.dpr };
  }

  /** Rectángulo del reloj en coordenadas CSS. */
  bounds(): { left: number; top: number; right: number; bottom: number } {
    const { W, H } = this.hg;
    return {
      left: this.ox / this.dpr,
      top: this.oy / this.dpr - CAP_CSS,
      right: (this.ox + W * this.s) / this.dpr,
      bottom: (this.oy + H * this.s) / this.dpr + CAP_CSS,
    };
  }

  draw(f: DrawFrame): void {
    const { ctx, hg, s, dpr, theme } = this;
    const { H, W } = hg;

    // 1. Preparar mapa de arena con sombreado 3D direccional, cresta superior iluminada y destellos de cuarzo.
    const grid = this.sim.grid;
    const buf = this.buf;
    const colors = this.colors;
    const { dim, groupOf } = this;
    const hl = dim && groupOf ? f.highlight : -1;
    const cut = dim ? f.cutoff : -1;
    if (dim && (hl >= 0 || cut >= 0)) {
      for (let i = 0; i < grid.length; i++) {
        const v = grid[i];
        if (v <= 0) {
          buf[i] = 0;
          continue;
        }
        const id = v - 1;
        const faded = (cut >= 0 && id >= cut) || (hl >= 0 && groupOf![id] !== hl);
        buf[i] = faded ? dim[id] : colors[id];
      }
    } else {
      for (let i = 0; i < grid.length; i++) {
        const v = grid[i];
        buf[i] = v > 0 ? colors[v - 1] : 0;
      }
    }

    if (!this.marbles) {
      const relief = this.relief;
      const sparkle = this.sparkle;
      for (let i = 0; i < grid.length; i++) {
        const c = buf[i];
        if (c === 0) continue;
        let k = relief[i];
        // Superficie expuesta a la luz cenital: filo cálido más luminoso.
        if (i >= W && grid[i - W] <= 0) k = (k * 296) >> 8;
        // Micro-destello mineral de cuarzo.
        const sp = sparkle[i];
        const r = Math.min(255, (((c & 0xff) * k) >> 8) + sp);
        const g = Math.min(255, ((((c >>> 8) & 0xff) * k) >> 8) + ((sp * 7) >> 3));
        const b = Math.min(255, ((((c >>> 16) & 0xff) * k) >> 8) + (sp >> 1));
        buf[i] = ((c & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0;
      }
    }
    this.offCtx.putImageData(this.img, 0, 0);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawSurroundings();

    // Reloj girado: alrededor de su centro y escalado para que quepa entero con su estructura.
    this.rot = f.rotation ?? 0;
    this.rotScale = 1;
    ctx.save();
    if (this.rot !== 0) {
      const c = this.center();
      const w = this.frame().capHalf * 2;
      const h = H * s + 2 * CAP_CSS * dpr;
      const cos = Math.abs(Math.cos(this.rot));
      const sin = Math.abs(Math.sin(this.rot));
      const availW = this.canvas.width - 32 * dpr;
      const availH = this.canvas.height - (TOP_RESERVE + this.topExtra + BOTTOM_RESERVE) * dpr;
      this.rotScale = Math.min(1, availW / (w * cos + h * sin), availH / (w * sin + h * cos));
      ctx.translate(c.x, c.y);
      ctx.rotate(this.rot);
      ctx.scale(this.rotScale, this.rotScale);
      ctx.translate(-c.x, -c.y);
    }

    // 2. Columna trasera sutil + base trasera (orden 3D real: detrás del vidrio).
    this.drawPedestalBack();
    this.drawRearPillar();

    // 3. Fondo del vidrio (cristal soplado con Fresnel y profundidad interior).
    ctx.fillStyle = theme.glassFill;
    ctx.fill(this.glassOuter);
    this.drawGlassBack();

    // 4. Arena recortada al interior real de la pared de vidrio + embudo continuo en la garganta.
    ctx.save();
    ctx.clip(this.glassInner);
    this.drawSand(ctx);
    this.drawNeckSandContinuity(f);
    ctx.restore();

    const glowCells = (fine: number, big: number) => s * (this.marbles ? big : fine);

    // 5. Hitos pendientes (brillo suave que late).
    if (f.marks.length) {
      const pulse = 0.5 + 0.3 * Math.sin(f.time / 900);
      for (const m of f.marks) this.drawGlow(m, Math.max(5 * dpr, glowCells(3.5, 0.95)), pulse);
    }

    // 6. Grano de hoy esperando en la punta del embudo (destello delicado integrado, nunca pegote).
    if (f.today) {
      const pulse = 0.45 + 0.45 * Math.sin(f.time / 650);
      this.drawGlow(f.today, Math.max(5.5 * dpr, glowCells(4.2, 1.05)), pulse * 0.58);
    }

    // 7. Granos protagonistas cayendo (pequeña lágrima luminosa con estela sutil de polvo dorado).
    for (const h of f.heroes) {
      const px = this.ox + h.x * s;
      const py = this.oy + h.y * s;
      const r = this.grainRadius();
      if (h.glow > 0.01) this.drawGlow(h, Math.max(7 * dpr, glowCells(5.5, 1.3)), h.glow * 0.72);
      // Estela corta de caída hacia arriba.
      const tailLen = Math.max(6 * dpr, r * 5.2);
      const tg = ctx.createLinearGradient(px, py - tailLen, px, py);
      tg.addColorStop(0, 'rgba(243, 206, 128, 0)');
      tg.addColorStop(1, h.color);
      ctx.strokeStyle = tg;
      ctx.lineWidth = Math.max(1 * dpr, r * 1.1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, py - tailLen);
      ctx.lineTo(px, py);
      ctx.stroke();

      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.ellipse(px, py, r * 0.9, r * 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 8. Vidrio delantero (pared gruesa con reflexión interna total, softboxes curvos y cintura 3D).
    this.drawGlassFront();

    // 9. Pedestales torneados 3D (arriba y abajo) y columnas laterales metálicas de precisión.
    this.drawSidePillars();
    this.drawPedestalsFront();

    // Dedo removiendo la arena
    if (f.finger) {
      const px = this.ox + f.finger.x * s;
      const py = this.oy + f.finger.y * s;
      ctx.strokeStyle = theme.glassEdge;
      ctx.lineWidth = 1.5 * dpr;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(px, py, f.finger.r * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Grano seleccionado
    if (f.selected) {
      const px = this.ox + f.selected.x * s;
      const py = this.oy + f.selected.y * s;
      ctx.strokeStyle = theme.glow;
      ctx.lineWidth = 1.7 * dpr;
      ctx.beginPath();
      ctx.arc(px, py, this.marbles ? s * 0.62 : Math.max(6 * dpr, s * 2.2), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (f.lens && this.rot === 0) this.drawLens(f.lens);
  }

  /**
   * Lupa de precisión: aumenta la arena con nitidez para distinguir cada día individual.
   */
  private drawLens(l: { x: number; y: number; grain: Point | null }): void {
    const { ctx, dpr, s, hg, theme } = this;
    const cx = l.x * dpr;
    const cy = l.y * dpr;
    const r = LENS_RADIUS * dpr;
    const zoom = Math.max(3, (11 * dpr) / s);
    const ring = new Path2D();
    ring.arc(cx, cy, r, 0, Math.PI * 2);

    ctx.save();
    ctx.shadowColor = theme.shadow;
    ctx.shadowBlur = 22 * dpr;
    ctx.shadowOffsetY = 6 * dpr;
    ctx.fillStyle = theme.bg;
    ctx.fill(ring);
    ctx.restore();

    ctx.save();
    ctx.clip(ring);
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = theme.glassFill;
    ctx.fill(this.glassOuter);
    // Dentro de la lupa se ven los granos individuales con nitidez.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, this.ox, this.oy, hg.W * s, hg.H * s);
    ctx.strokeStyle = theme.glassEdge;
    ctx.lineWidth = (1.5 * dpr) / zoom;
    ctx.stroke(this.glassOuter);
    if (l.grain) {
      const m = s * 0.14;
      ctx.strokeStyle = theme.glow;
      ctx.lineWidth = (1.8 * dpr) / zoom;
      ctx.beginPath();
      ctx.roundRect(
        this.ox + (l.grain.x - 0.5) * s - m,
        this.oy + (l.grain.y - 0.5) * s - m,
        s + 2 * m,
        s + 2 * m,
        0.25 * s,
      );
      ctx.stroke();
    }
    ctx.restore();

    // Brillo óptico de lente convexa.
    ctx.save();
    ctx.clip(ring);
    const sheen = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.4, cy + r * 0.4);
    sheen.addColorStop(0, theme.glassShine);
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.globalAlpha = 0.45;
    ctx.fill(ring);
    ctx.restore();

    ctx.lineWidth = 1.8 * dpr;
    ctx.strokeStyle = theme.glassEdge;
    ctx.stroke(ring);
  }

  snapshot(width: number, height: number, frame: DrawFrame): { canvas: HTMLCanvasElement; box: ReturnType<Renderer['bounds']> } {
    const canvas = document.createElement('canvas');
    const r = new Renderer(canvas, this.hg, this.sim, this.colors);
    r.setColors(this.colors, this.dim, this.groupOf);
    r.resize(width, height, 1);
    r.draw(frame);
    return { canvas, box: r.bounds() };
  }

  /** Medidas del reloj y su estructura 3D en píxeles de dispositivo. */
  private frame() {
    const { s, dpr, hg } = this;
    const cx = this.ox + (hg.W / 2) * s;
    const glassHalf = (hg.maxHalf + 0.72) * s;
    const capH = CAP_CSS * dpr;
    const capHalf = glassHalf * 1.18;
    const pillarX = glassHalf * 1.075;
    const capRy = Math.max(5.5 * dpr, capHalf * 0.088);
    return { cx, glassHalf, capH, capHalf, pillarX, capRy, top: this.oy, bottom: this.oy + hg.H * s };
  }

  /** Plano de estudio común y sombra de contacto direccional coherente bajo la peana 3D. */
  private drawSurroundings(): void {
    const { ctx, theme } = this;
    const f = this.frame();
    const baseBottomY = f.bottom + f.capH * 0.78;
    const horizonY = baseBottomY - f.capRy * 0.65;

    drawStudioSurface(ctx, this.canvas.width, this.canvas.height, horizonY, f.cx, f.capHalf, theme.isLight);
    drawStudioShadow(ctx, f.cx, baseBottomY + f.capRy * 0.14, f.capHalf * 1.04, f.capRy * 1.18, theme.isLight, 1);
  }

  /** Mitad trasera de la base y la corona (donde asienta el vidrio en profundidad 3D). */
  private drawPedestalBack(): void {
    const { ctx, theme } = this;
    const f = this.frame();
    const pal = studioPalette(theme.isLight);

    // Cara superior trasera de la base inferior (se ve a través del cristal vacío de abajo).
    const botTopY = f.bottom + f.capH * 0.08;
    ctx.save();
    const discGrad = ctx.createLinearGradient(f.cx - f.capHalf, botTopY, f.cx + f.capHalf, botTopY);
    if (pal.isLight) {
      discGrad.addColorStop(0, '#babdc3');
      discGrad.addColorStop(0.28, '#e8eaee');
      discGrad.addColorStop(0.68, '#cfd2d8');
      discGrad.addColorStop(1, '#a3a7ae');
    } else {
      discGrad.addColorStop(0, '#131417');
      discGrad.addColorStop(0.26, '#2b2e34');
      discGrad.addColorStop(0.62, '#1d1f24');
      discGrad.addColorStop(1, '#0e0f12');
    }
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.ellipse(f.cx, botTopY, f.capHalf, f.capRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rebaje circular interior (asiento mecanizado oscuro para el vidrio).
    const seatRx = this.glassHalf(this.hg.H) * this.s * 1.03;
    const seatRy = f.capRy * 0.62;
    ctx.fillStyle = pal.isLight ? 'rgba(30, 32, 36, 0.16)' : 'rgba(4, 5, 6, 0.72)';
    ctx.beginPath();
    ctx.ellipse(f.cx, botTopY + f.capRy * 0.04, seatRx, seatRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Columna trasera muy sutil vista detrás del cristal para cerrar el trípode 3D. */
  private drawRearPillar(): void {
    const { ctx, theme, dpr } = this;
    const f = this.frame();
    const rw = Math.max(1.8 * dpr, f.glassHalf * 0.022);
    const y0 = f.top - f.capH * 0.1;
    const y1 = f.bottom + f.capH * 0.08;
    ctx.save();
    ctx.globalAlpha = theme.isLight ? 0.14 : 0.14;
    const g = ctx.createLinearGradient(f.cx - rw, 0, f.cx + rw, 0);
    g.addColorStop(0, '#111214');
    g.addColorStop(0.36, '#8a8d94');
    g.addColorStop(1, '#111214');
    ctx.fillStyle = g;
    ctx.fillRect(f.cx - rw, y0, rw * 2, y1 - y0);
    ctx.restore();
  }

  /** Fondo interior del vidrio: gradiente Fresnel neutro + sombreado en los encajes. */
  private drawGlassBack(): void {
    const { ctx, theme, dpr } = this;
    const f = this.frame();
    const h = f.bottom - f.top;
    ctx.save();
    ctx.clip(this.glassOuter);

    const g = ctx.createLinearGradient(f.cx - f.glassHalf, 0, f.cx + f.glassHalf, 0);
    g.addColorStop(0, theme.isLight ? 'rgba(36, 40, 46, 0.14)' : 'rgba(225, 228, 234, 0.11)');
    g.addColorStop(0.14, 'rgba(255,255,255,0.015)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.015)');
    g.addColorStop(1, theme.isLight ? 'rgba(36, 40, 46, 0.16)' : 'rgba(218, 214, 206, 0.09)');
    ctx.fillStyle = g;
    ctx.fillRect(f.cx - f.glassHalf, f.top, f.glassHalf * 2, h);

    // Sombra curva donde el vidrio entra en la corona superior y la base inferior.
    const seatH = Math.min(26 * dpr, h * 0.08);
    const topSeat = ctx.createLinearGradient(0, f.top, 0, f.top + seatH);
    topSeat.addColorStop(0, theme.isLight ? 'rgba(24,26,30,0.18)' : 'rgba(0,0,0,0.38)');
    topSeat.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topSeat;
    ctx.fillRect(f.cx - f.glassHalf, f.top, f.glassHalf * 2, seatH);

    const botSeat = ctx.createLinearGradient(0, f.bottom - seatH, 0, f.bottom);
    botSeat.addColorStop(0, 'rgba(0,0,0,0)');
    botSeat.addColorStop(1, theme.isLight ? 'rgba(24,26,30,0.16)' : 'rgba(0,0,0,0.32)');
    ctx.fillStyle = botSeat;
    ctx.fillRect(f.cx - f.glassHalf, f.bottom - seatH, f.glassHalf * 2, seatH);
    ctx.restore();
  }

  /**
   * Frente del vidrio: pared real con doble borde refractivo neutro,
   * reflejos curvos de softbox (arriba-izquierda) y garganta de vidrio soplado en 3D.
   */
  private drawGlassFront(): void {
    const { ctx, theme, dpr } = this;
    const f = this.frame();
    const pal = studioPalette(theme.isLight);

    // 1. Banda sólida de la pared de vidrio borosilicato neutro.
    ctx.save();
    const wallGrad = ctx.createLinearGradient(f.cx - f.glassHalf, 0, f.cx + f.glassHalf, 0);
    wallGrad.addColorStop(0, pal.glassWallLeft);
    wallGrad.addColorStop(0.18, pal.isLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(240, 242, 245, 0.13)');
    wallGrad.addColorStop(0.5, pal.glassWallMid);
    wallGrad.addColorStop(0.82, pal.isLight ? 'rgba(255, 255, 255, 0.6)' : 'rgba(222, 214, 198, 0.1)');
    wallGrad.addColorStop(1, pal.glassWallRight);
    ctx.fillStyle = wallGrad;
    ctx.fill(this.glassWallBand, 'evenodd');
    ctx.restore();

    // 2. Reflejos curvos de softbox + óptica 3D del cuello recortados al vidrio exterior.
    ctx.save();
    ctx.clip(this.glassOuter);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const { path, width, y0, y1, alpha, warm } of this.shine) {
      const col = warm ? pal.glassRimWarm : pal.glassShine;
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.2, col);
      g.addColorStop(0.8, col);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.globalAlpha = 0.34 * alpha;
      ctx.lineWidth = width;
      ctx.stroke(path);
      ctx.globalAlpha = 0.68 * alpha;
      ctx.lineWidth = Math.max(1.1 * dpr, width * 0.2);
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;

    this.drawWaistOptical();
    ctx.restore();

    // 3. Línea interior sutil (cara interna del vidrio) y borde exterior especular neutro.
    const rim = Math.max(1.0 * dpr, Math.min(2.0 * dpr, f.glassHalf * 0.012));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.8, rim * 0.7);
    ctx.strokeStyle = pal.glassInnerEdge;
    ctx.stroke(this.glassInner);

    const edgeGrad = ctx.createLinearGradient(f.cx - f.glassHalf, f.top, f.cx + f.glassHalf, f.bottom);
    edgeGrad.addColorStop(0, pal.glassShine);
    edgeGrad.addColorStop(0.28, pal.glassOuterEdge);
    edgeGrad.addColorStop(0.55, pal.glassShine);
    edgeGrad.addColorStop(0.82, pal.glassOuterEdge);
    edgeGrad.addColorStop(1, pal.glassRimWarm);
    ctx.lineWidth = rim;
    ctx.strokeStyle = edgeGrad;
    ctx.stroke(this.glassOuter);
    ctx.restore();
  }

  /** Óptica 3D del estrechamiento central (cintura soplada con vidrio engrosado y anillos de refracción). */
  private drawWaistOptical(): void {
    const { ctx, hg, s, dpr, theme } = this;
    const f = this.frame();
    const neckTopY = this.oy + hg.topEnd * s;
    const neckBotY = this.oy + hg.bottomStart * s;
    const neckMidY = (neckTopY + neckBotY) * 0.5;
    const neckRx = Math.max(3.4 * dpr, this.glassHalf((hg.topEnd + hg.bottomStart) * 0.5) * s);
    const neckRy = Math.max(2.2 * dpr, neckRx * 0.42);
    const rim = Math.max(1 * dpr, f.glassHalf * 0.011);

    ctx.save();
    // Anillo elíptico óptico de la cintura (labio trasero suave + labio frontal luminoso).
    ctx.beginPath();
    ctx.ellipse(f.cx, neckMidY, neckRx * 0.94, neckRy, 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = theme.glassEdge;
    ctx.globalAlpha = 0.24;
    ctx.lineWidth = Math.max(0.8, rim * 0.7);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(f.cx, neckMidY, neckRx * 0.98, neckRy * 1.05, 0, 0.08, Math.PI - 0.08);
    ctx.strokeStyle = theme.glassShine;
    ctx.globalAlpha = 0.62;
    ctx.lineWidth = Math.max(1.1, rim * 0.95);
    ctx.stroke();

    // Brillos curvos concentrados en el vidrio engrosado del estrechamiento.
    const spanY = Math.max(14 * dpr, (neckBotY - neckTopY) * 1.8);
    const y0 = Math.max(0, (neckMidY - spanY - this.oy) / s);
    const y1 = Math.min(hg.H, (neckMidY + spanY - this.oy) / s);
    ctx.lineCap = 'round';
    for (const [side, alpha] of [
      [-0.72, 0.62],
      [0.78, 0.32],
    ] as const) {
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const gy = y0 + ((y1 - y0) * i) / 16;
        const gx = f.cx + side * this.glassHalf(gy) * s;
        if (i === 0) ctx.moveTo(gx, this.oy + gy * s);
        else ctx.lineTo(gx, this.oy + gy * s);
      }
      ctx.strokeStyle = theme.glassShine;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(1.2 * dpr, rim);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Dos columnas cilíndricas laterales de acero pavonado neutro con casquillos de latón envejecido. */
  private drawSidePillars(): void {
    const { ctx, theme, dpr } = this;
    const f = this.frame();
    const pal = studioPalette(theme.isLight);
    const pw = Math.max(2.6 * dpr, Math.min(5.2 * dpr, f.glassHalf * 0.036));
    const yTop = f.top - f.capH * 0.05;
    const yBot = f.bottom + f.capH * 0.1;

    for (const side of [-1, 1]) {
      const px = f.cx + side * f.pillarX;

      ctx.fillStyle = gunmetalGradient(ctx, px - pw, px + pw, pal);
      ctx.fillRect(px - pw, yTop, pw * 2, yBot - yTop);

      // Casquillos torneados en latón envejecido arriba y abajo.
      const fw = pw * 1.48;
      const fh = Math.max(4.5 * dpr, f.capH * 0.22);
      for (const fy of [f.top + f.capRy * 0.68, yBot - fh]) {
        ctx.fillStyle = agedBrassGradient(ctx, px - fw, px + fw, pal);
        ctx.beginPath();
        ctx.roundRect(px - fw, fy, fw * 2, fh, fh * 0.35);
        ctx.fill();
      }
    }
  }

  /** Pedestales cilíndricos 3D torneados en acero pavonado con bisel de latón envejecido. */
  private drawPedestalsFront(): void {
    const { ctx, theme, dpr } = this;
    const f = this.frame();
    const pal = studioPalette(theme.isLight);
    const thick = Math.max(9 * dpr, f.capH * 0.58);

    const drawCylinderCap = (faceY: number, isTop: boolean) => {
      const rx = f.capHalf;
      const ry = f.capRy;
      const botFaceY = faceY + thick;

      ctx.save();
      // 1. Pared lateral cilíndrica del pedestal con reflejo metálico torneado.
      ctx.beginPath();
      ctx.ellipse(f.cx, botFaceY, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(f.cx - rx, faceY);
      ctx.ellipse(f.cx, faceY, rx, ry, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fillStyle = gunmetalGradient(ctx, f.cx - rx, f.cx + rx, pal);
      ctx.fill();

      // 2. Filete biselado fino en latón envejecido en el canto del pedestal.
      ctx.strokeStyle = agedBrassGradient(ctx, f.cx - rx, f.cx + rx, pal, 0.88);
      ctx.lineWidth = Math.max(1.2, 1.45 * dpr);
      ctx.beginPath();
      ctx.ellipse(f.cx, isTop ? botFaceY - 1.2 * dpr : faceY + 1.2 * dpr, rx * 0.995, ry * 0.98, 0, 0.04, Math.PI - 0.04);
      ctx.stroke();

      // 3. Cara superior elíptica 3D de la corona (arriba) o labio delantero de la base (abajo).
      if (isTop) {
        const topGrad = ctx.createLinearGradient(f.cx - rx, faceY - ry, f.cx + rx, faceY + ry);
        if (pal.isLight) {
          topGrad.addColorStop(0, '#f4f5f7');
          topGrad.addColorStop(0.5, '#d5d7dc');
          topGrad.addColorStop(1, '#b6b9c0');
        } else {
          topGrad.addColorStop(0, '#33363c');
          topGrad.addColorStop(0.42, '#202226');
          topGrad.addColorStop(1, '#111215');
        }
        ctx.fillStyle = topGrad;
        ctx.beginPath();
        ctx.ellipse(f.cx, faceY, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rebaje concéntrico sutil en la cara superior de la corona.
        ctx.strokeStyle = pal.isLight ? 'rgba(255, 255, 255, 0.65)' : 'rgba(235, 237, 240, 0.13)';
        ctx.lineWidth = Math.max(0.9, 1 * dpr);
        ctx.beginPath();
        ctx.ellipse(f.cx, faceY, rx * 0.84, ry * 0.82, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Borde frontal sutil de la base sobre el que apoya el vidrio.
        ctx.strokeStyle = pal.isLight ? 'rgba(255, 255, 255, 0.68)' : 'rgba(235, 237, 240, 0.18)';
        ctx.lineWidth = Math.max(1, 1.15 * dpr);
        ctx.beginPath();
        ctx.ellipse(f.cx, faceY, rx * 0.99, ry * 0.98, 0, 0.06, Math.PI - 0.06);
        ctx.stroke();
      }

      // Contorno sutil del canto inferior para separar de la sombra.
      ctx.strokeStyle = pal.isLight ? 'rgba(20, 22, 26, 0.22)' : 'rgba(0, 0, 0, 0.58)';
      ctx.lineWidth = Math.max(1, 1.1 * dpr);
      ctx.beginPath();
      ctx.ellipse(f.cx, botFaceY, rx, ry, 0, 0.02, Math.PI - 0.02);
      ctx.stroke();
      ctx.restore();
    };

    // Corona superior (encaja sobre f.top) y base inferior (sostiene f.bottom).
    drawCylinderCap(f.top - thick - f.capRy * 0.2, true);
    drawCylinderCap(f.bottom + f.capH * 0.08, false);
  }

  private drawGlow(p: Point, radius: number, intensity: number): void {
    const { ctx, s } = this;
    const x = this.ox + p.x * s;
    const y = this.oy + p.y * s;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, this.theme.glow);
    g.addColorStop(1, 'rgba(196, 173, 130, 0)');
    ctx.save();
    ctx.globalAlpha = intensity * 0.55;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
