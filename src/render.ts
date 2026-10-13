import type { Hourglass } from './hourglass';
import type { SandSim } from './sim';

export interface Point {
  x: number; // coordenadas de rejilla (celdas, admite decimales)
  y: number;
}

export interface HeroDraw extends Point {
  color: string;
  glow: number; // 0..1
}

export interface DrawFrame {
  time: number;
  heroes: HeroDraw[];
  today: Point | null;
  selected: Point | null;
}

interface Theme {
  glassFill: string;
  glassEdge: string;
  glassShine: string;
  cap: string;
  capEdge: string;
  glow: string;
}

const TOP_RESERVE = 56;
const BOTTOM_RESERVE = 76;
const CAP_CSS = 14;

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
  private glass = new Path2D();
  private theme!: Theme;

  constructor(
    private canvas: HTMLCanvasElement,
    private hg: Hourglass,
    private sim: SandSim,
    private colors: Uint32Array,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.off = document.createElement('canvas');
    this.off.width = hg.W;
    this.off.height = hg.H;
    this.offCtx = this.off.getContext('2d')!;
    this.img = this.offCtx.createImageData(hg.W, hg.H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.refreshTheme();
    this.resize();
  }

  refreshTheme(): void {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    this.theme = {
      glassFill: v('--glass-fill'),
      glassEdge: v('--glass-edge'),
      glassShine: v('--glass-shine'),
      cap: v('--cap'),
      capEdge: v('--cap-edge'),
      glow: v('--glow'),
    };
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const { W, H } = this.hg;
    const availW = (cssW - 32) * dpr;
    const availH = (cssH - TOP_RESERVE - BOTTOM_RESERVE - CAP_CSS * 2) * dpr;
    this.s = Math.max(0.5, Math.min(availW / (W + 4), availH / H));
    this.ox = Math.round((this.canvas.width - W * this.s) / 2);
    this.oy = Math.round((TOP_RESERVE + CAP_CSS) * dpr + (availH - H * this.s) / 2);
    this.glass = this.buildGlassPath();
  }

  private buildGlassPath(): Path2D {
    const { H, W, half } = this.hg;
    const s = this.s;
    const cx = this.ox + (W / 2) * s;
    const pad = 0.6;
    const p = new Path2D();
    const yAt = (y: number) => this.oy + y * s;
    p.moveTo(cx - (half[0] + pad) * s, yAt(0));
    for (let y = 0; y < H; y++) p.lineTo(cx - (half[y] + pad) * s, yAt(y + 0.5));
    p.lineTo(cx - (half[H - 1] + pad) * s, yAt(H));
    p.lineTo(cx + (half[H - 1] + pad) * s, yAt(H));
    for (let y = H - 1; y >= 0; y--) p.lineTo(cx + (half[y] + pad) * s, yAt(y + 0.5));
    p.lineTo(cx + (half[0] + pad) * s, yAt(0));
    p.closePath();
    return p;
  }

  /** Coordenadas CSS del puntero → coordenadas de rejilla. */
  toGrid(cssX: number, cssY: number): Point {
    return { x: (cssX * this.dpr - this.ox) / this.s, y: (cssY * this.dpr - this.oy) / this.s };
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
    const { W, H, maxHalf } = hg;
    const cx = this.ox + (W / 2) * s;

    // Arena: un píxel por celda en el lienzo auxiliar, escalado sin suavizado.
    const grid = this.sim.grid;
    const buf = this.buf;
    const colors = this.colors;
    for (let i = 0; i < grid.length; i++) {
      const v = grid[i];
      buf[i] = v > 0 ? colors[v - 1] : 0;
    }
    this.offCtx.putImageData(this.img, 0, 0);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Vidrio (fondo)
    ctx.fillStyle = theme.glassFill;
    ctx.fill(this.glass);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, this.ox, this.oy, W * s, H * s);

    // Grano de hoy, esperando en el cuello
    if (f.today) {
      const pulse = 0.55 + 0.45 * Math.sin(f.time / 600);
      this.drawGlow(f.today, Math.max(6 * dpr, s * 5), pulse * 0.7);
    }

    // Granos protagonistas cayendo
    for (const h of f.heroes) {
      const px = this.ox + h.x * s;
      const py = this.oy + h.y * s;
      if (h.glow > 0.01) this.drawGlow(h, Math.max(9 * dpr, s * 7), h.glow);
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.6 * dpr, s * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }

    // Brillo del vidrio
    ctx.save();
    ctx.clip(this.glass);
    const left = cx - maxHalf * s;
    const width = maxHalf * 2 * s;
    const grad = ctx.createLinearGradient(left, 0, left + width, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.1, theme.glassShine);
    grad.addColorStop(0.2, 'rgba(255,255,255,0)');
    grad.addColorStop(0.82, 'rgba(255,255,255,0)');
    grad.addColorStop(0.88, theme.glassShine);
    grad.addColorStop(0.92, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = grad;
    ctx.fillRect(left, this.oy, width, H * s);
    ctx.restore();

    ctx.lineWidth = Math.max(1, 1.4 * dpr);
    ctx.strokeStyle = theme.glassEdge;
    ctx.lineJoin = 'round';
    ctx.stroke(this.glass);

    // Tapas
    const capW = (maxHalf * 2 + 8) * s;
    const capH = CAP_CSS * dpr;
    ctx.fillStyle = theme.cap;
    ctx.strokeStyle = theme.capEdge;
    ctx.lineWidth = dpr;
    for (const y of [this.oy - capH, this.oy + H * s]) {
      ctx.beginPath();
      ctx.roundRect(cx - capW / 2, y, capW, capH, capH * 0.4);
      ctx.fill();
      ctx.stroke();
    }

    // Grano seleccionado
    if (f.selected) {
      const px = this.ox + f.selected.x * s;
      const py = this.oy + f.selected.y * s;
      ctx.strokeStyle = theme.glow;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(6 * dpr, s * 2.2), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawGlow(p: Point, radius: number, alpha: number): void {
    const ctx = this.ctx;
    const px = this.ox + p.x * this.s;
    const py = this.oy + p.y * this.s;
    const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
    g.addColorStop(0, this.theme.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = g;
    ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }
}
