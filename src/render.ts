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
  cap: string;
  capEdge: string;
  glow: string;
  bg: string;
}

/** Radio de la lupa en píxeles CSS. */
export const LENS_RADIUS = 64;

const TOP_RESERVE = 56;
const BOTTOM_RESERVE = 104;
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
  private dim: Uint32Array | null = null;
  /** Espacio extra arriba (px CSS), para el panel de reproducción. Tras cambiarlo hay que llamar a `resize`. */
  topExtra = 0;
  /** Giro y escala con los que se dibujó el último fotograma, para deshacerlos al tocar. */
  private rot = 0;
  private rotScale = 1;
  private groupOf: Uint16Array | null = null;

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

  /** Cambia la paleta. `dim` es la versión atenuada; con `groupOf` se puede resaltar un grupo. */
  setColors(colors: Uint32Array, dim: Uint32Array | null = null, groupOf: Uint16Array | null = null): void {
    this.colors = colors;
    this.dim = dim;
    this.groupOf = groupOf;
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
      bg: v('--bg-2'),
    };
  }

  resize(cssW = window.innerWidth, cssH = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 3)): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const { W, H } = this.hg;
    const availW = (cssW - 32) * dpr;
    const top = TOP_RESERVE + this.topExtra;
    const availH = (cssH - top - BOTTOM_RESERVE - CAP_CSS * 2) * dpr;
    this.s = Math.max(0.5, Math.min(availW / (W + 4), availH / H));
    this.ox = Math.round((this.canvas.width - W * this.s) / 2);
    this.oy = Math.round((top + CAP_CSS) * dpr + (availH - H * this.s) / 2);
    // Con pocos granos (años, nóminas) las celdas son grandes: se pintan como canicas.
    this.marbles = this.sim.grainCount <= 5000 && this.s >= 6;
    this.glass = this.buildGlassPath();
  }

  /** Los granos se dibujan como canicas redondas en vez de píxeles. */
  marbles = false;

  private buildGlassPath(): Path2D {
    const { H, W, half } = this.hg;
    const s = this.s;
    const cx = this.ox + (W / 2) * s;
    const pad = 0.6;
    // En cada frontera entre filas, la más ancha de las dos: así el vidrio envuelve las celdas
    // enteras aunque sean grandes y el perfil cambie mucho de una fila a otra.
    const edge = (y: number) => Math.max(half[Math.max(0, y - 1)], half[Math.min(H - 1, y)]) + pad;
    const p = new Path2D();
    const yAt = (y: number) => this.oy + y * s;
    p.moveTo(cx - edge(0) * s, yAt(0));
    for (let y = 1; y <= H; y++) p.lineTo(cx - edge(y) * s, yAt(y));
    p.lineTo(cx + edge(H) * s, yAt(H));
    for (let y = H - 1; y >= 0; y--) p.lineTo(cx + edge(y) * s, yAt(y));
    p.closePath();
    return p;
  }

  /** Cadenas CSS de los colores empaquetados, para las canicas. */
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

  /** Radio de un grano suelto (el que cae, el seleccionado…) en píxeles de dispositivo. */
  private grainRadius(): number {
    return this.marbles ? this.s * 0.46 : Math.max(1.6 * this.dpr, this.s * 0.9);
  }

  /** Dibuja la arena: el lienzo auxiliar escalado o, con celdas grandes, una canica por grano. */
  private drawSand(ctx: CanvasRenderingContext2D): void {
    const { hg, s } = this;
    if (!this.marbles) {
      ctx.imageSmoothingEnabled = false;
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
    // Un brillo pequeño arriba a la izquierda de cada canica, todos de una vez.
    const shine = new Path2D();
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 0 || buf[i] >>> 24 < 200) continue;
      const x = this.ox + ((i % hg.W) + 0.34) * s;
      const y = this.oy + (Math.floor(i / hg.W) + 0.32) * s;
      shine.moveTo(x + r * 0.2, y);
      shine.arc(x, y, r * 0.2, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill(shine);
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
    const { W, H, maxHalf } = hg;
    const cx = this.ox + (W / 2) * s;

    // Arena: un píxel por celda en el lienzo auxiliar, escalado sin suavizado.
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
    this.offCtx.putImageData(this.img, 0, 0);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Reloj girado: alrededor de su centro y, si hace falta, más pequeño para que quepa.
    this.rot = f.rotation ?? 0;
    this.rotScale = 1;
    ctx.save();
    if (this.rot !== 0) {
      const c = this.center();
      const w = W * s;
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

    // Vidrio (fondo)
    ctx.fillStyle = theme.glassFill;
    ctx.fill(this.glass);

    this.drawSand(ctx);

    // Los brillos se miden en celdas; con canicas, una celda ya es grande.
    const glowCells = (fine: number, big: number) => s * (this.marbles ? big : fine);

    // Hitos pendientes: un brillo pequeño que late despacio
    if (f.marks.length) {
      const pulse = 0.5 + 0.3 * Math.sin(f.time / 900);
      for (const m of f.marks) this.drawGlow(m, Math.max(5 * dpr, glowCells(3.5, 0.9)), pulse);
    }

    // Grano de hoy, esperando en el cuello
    if (f.today) {
      const pulse = 0.55 + 0.45 * Math.sin(f.time / 600);
      this.drawGlow(f.today, Math.max(6 * dpr, glowCells(5, 1.1)), pulse * 0.7);
    }

    // Granos protagonistas cayendo
    for (const h of f.heroes) {
      const px = this.ox + h.x * s;
      const py = this.oy + h.y * s;
      if (h.glow > 0.01) this.drawGlow(h, Math.max(9 * dpr, glowCells(7, 1.4)), h.glow);
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.arc(px, py, this.grainRadius(), 0, Math.PI * 2);
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
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(px, py, this.marbles ? s * 0.62 : Math.max(6 * dpr, s * 2.2), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (f.lens && this.rot === 0) this.drawLens(f.lens);
  }

  /**
   * Lupa redonda centrada en el ratón: el reloj ampliado (vidrio incluido) para que cada grano
   * mida unos 10 px, con el grano señalado recuadrado.
   */
  private drawLens(l: NonNullable<DrawFrame['lens']>): void {
    const { ctx, dpr, s, theme } = this;
    const cx = l.x * dpr;
    const cy = l.y * dpr;
    const r = LENS_RADIUS * dpr;
    const zoom = Math.max(10 * dpr, s * 3) / s;
    const ring = new Path2D();
    ring.arc(cx, cy, r, 0, Math.PI * 2);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 18 * dpr;
    ctx.fillStyle = theme.bg;
    ctx.fill(ring);
    ctx.restore();

    ctx.save();
    ctx.clip(ring);
    // Lo que hay bajo el ratón, en píxeles de pantalla, pasa a ocupar el centro de la lupa.
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = theme.glassFill;
    ctx.fill(this.glass);
    this.drawSand(ctx);
    ctx.lineWidth = (1.5 * dpr) / zoom;
    ctx.strokeStyle = theme.glassEdge;
    ctx.stroke(this.glass);
    if (l.grain) {
      const m = 0.25 * s;
      ctx.lineWidth = (2 * dpr) / zoom;
      ctx.strokeStyle = theme.glow;
      ctx.strokeRect(this.ox + (l.grain.x - 0.5) * s - m, this.oy + (l.grain.y - 0.5) * s - m, s + 2 * m, s + 2 * m);
    }
    ctx.restore();

    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = theme.glassEdge;
    ctx.stroke(ring);
  }

  /**
   * Dibuja el reloj en un lienzo aparte, de `width` × `height` píxeles, para la imagen de compartir.
   * Devuelve el lienzo (fondo transparente) y el rectángulo que ocupa el reloj.
   */
  snapshot(width: number, height: number, frame: DrawFrame): { canvas: HTMLCanvasElement; box: ReturnType<Renderer['bounds']> } {
    const canvas = document.createElement('canvas');
    const r = new Renderer(canvas, this.hg, this.sim, this.colors);
    r.setColors(this.colors, this.dim, this.groupOf);
    r.resize(width, height, 1);
    r.draw(frame);
    return { canvas, box: r.bounds() };
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
