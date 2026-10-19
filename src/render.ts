import { profileHalf, type Hourglass } from './hourglass';
import type { GrainSim } from './sim';
import { MarbleSim } from './marbles';

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
  shadow: string;
  ambient: string;
}

/** Radio de la lupa en píxeles CSS. */
export const LENS_RADIUS = 64;

const TOP_RESERVE = 56;
const BOTTOM_RESERVE = 104;
const CAP_CSS = 18;
/** Ancho de las tapas respecto al del vidrio: tienen que caber. */
const FRAME_SPAN = 1.1;

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
      shadow: v('--shadow'),
      ambient: v('--ambient'),
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
    // Las tapas sobresalen un poco del vidrio: tienen que caber.
    this.s = Math.max(0.5, Math.min(availW / (W + 4), availW / ((this.hg.maxHalf + 0.6) * 2 * FRAME_SPAN), availH / H));
    this.ox = Math.round((this.canvas.width - W * this.s) / 2);
    this.oy = Math.round((top + CAP_CSS) * dpr + (availH - H * this.s) / 2);
    // Las canicas con física, siempre redondas; la arena, solo si las celdas son muy grandes.
    this.marbles = this.sim instanceof MarbleSim || (this.sim.grainCount <= 5000 && this.s >= 6);
    this.glass = this.buildGlassPath();
    this.shine = this.buildShine();
    this.relief = this.buildRelief();
  }

  /** Brillos curvos del vidrio, que siguen la forma de cada bulbo. */
  private shine: { path: Path2D; width: number; y0: number; y1: number; alpha: number }[] = [];
  /** Sombreado de la arena por celda (×256): más oscura junto al vidrio, como en un cristal redondo. */
  private relief: Uint16Array = new Uint16Array(0);

  /** Semiancho del vidrio a la altura y (en celdas), el mismo perfil con que se dibuja. */
  private glassHalf(y: number): number {
    return profileHalf(this.hg, Math.max(0, Math.min(this.hg.H, y))) + 0.6;
  }

  private buildShine(): { path: Path2D; width: number; y0: number; y1: number; alpha: number }[] {
    const { topEnd, bottomStart, H, W } = this.hg;
    const s = this.s;
    const cx = this.ox + (W / 2) * s;
    const out: { path: Path2D; width: number; y0: number; y1: number; alpha: number }[] = [];
    // En cada bulbo, una franja a la izquierda y otra más fina a la derecha, lejos del cuello y de las tapas.
    for (const [y0, y1] of [
      [topEnd * 0.1, topEnd * 0.62],
      [bottomStart + (H - bottomStart) * 0.38, H - (H - bottomStart) * 0.1],
    ]) {
      for (const [k, w, alpha] of [
        [-0.7, 0.16, 1],
        [0.8, 0.06, 0.6],
      ]) {
        const p = new Path2D();
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
          const y = y0 + ((y1 - y0) * i) / steps;
          const x = cx + k * this.glassHalf(y) * s;
          if (i === 0) p.moveTo(x, this.oy + y * s);
          else p.lineTo(x, this.oy + y * s);
        }
        out.push({ path: p, width: Math.max(2 * this.dpr, this.hg.maxHalf * s * w), y0: this.oy + y0 * s, y1: this.oy + y1 * s, alpha });
      }
    }
    return out;
  }

  private buildRelief(): Uint16Array {
    const { W, H, half } = this.hg;
    const out = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) {
      const h = half[y] + 0.5;
      for (let x = 0; x < W; x++) {
        const d = Math.min(1, Math.abs(x + 0.5 - W / 2) / h);
        // Como la luz sobre un cilindro: 1 en el centro, más oscuro hacia los lados.
        out[y * W + x] = Math.round(256 * (0.74 + 0.3 * Math.sqrt(1 - d * d)));
      }
    }
    return out;
  }

  /** Los granos se dibujan como canicas redondas en vez de píxeles. */
  marbles = false;

  /**
   * Contorno del vidrio: la curva continua del perfil (más 0,6 celdas de holgura), muestreada
   * con detalle aunque el reloj tenga pocas filas, para que sea suave y no poligonal.
   */
  private buildGlassPath(): Path2D {
    const { H, W } = this.hg;
    const s = this.s;
    const cx = this.ox + (W / 2) * s;
    const n = Math.max(240, H * 6);
    const p = new Path2D();
    const yAt = (y: number) => this.oy + y * s;
    for (let i = 0; i <= n; i++) {
      const y = (H * i) / n;
      const x = cx - this.glassHalf(y) * s;
      if (i === 0) p.moveTo(x, yAt(y));
      else p.lineTo(x, yAt(y));
    }
    for (let i = n; i >= 0; i--) {
      const y = (H * i) / n;
      p.lineTo(cx + this.glassHalf(y) * s, yAt(y));
    }
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

  /** Resaltado y recorte del fotograma en curso, para colorear cada canica. */
  private frameHl = -1;
  private frameCut = -1;

  /** Color de un grano en este fotograma, y si va atenuado. */
  private colorOf(id: number): [number, boolean] {
    const { dim, groupOf } = this;
    const faded = !!dim && ((this.frameCut >= 0 && id >= this.frameCut) || (this.frameHl >= 0 && !!groupOf && groupOf[id] !== this.frameHl));
    return [faded ? dim![id] : this.colors[id], faded];
  }

  /**
   * Sombreado de una canica, igual para todas: borde algo más oscuro y un brillo arriba a la
   * izquierda, como el de una canica de cristal. Se pinta encima del color de cada una.
   */
  private shade: HTMLCanvasElement | null = null;
  private shadeR = 0;
  private marbleShade(r: number): HTMLCanvasElement {
    if (this.shade && Math.abs(this.shadeR - r) < 0.01) return this.shade;
    const size = Math.ceil(r * 2) + 2;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const m = size / 2;
    const disc = () => {
      g.beginPath();
      g.arc(m, m, r, 0, Math.PI * 2);
      g.fill();
    };
    let grad = g.createRadialGradient(m - r * 0.2, m - r * 0.25, r * 0.35, m, m, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.75, 'rgba(60,30,0,0.12)');
    grad.addColorStop(1, 'rgba(40,18,0,0.45)');
    g.fillStyle = grad;
    disc();
    grad = g.createRadialGradient(m - r * 0.36, m - r * 0.42, 0, m - r * 0.36, m - r * 0.42, r * 0.6);
    grad.addColorStop(0, 'rgba(255,255,255,0.75)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    disc();
    this.shade = c;
    this.shadeR = r;
    return c;
  }

  /** Una canica en (px, py), en píxeles de dispositivo. */
  private drawMarble(ctx: CanvasRenderingContext2D, px: number, py: number, r: number, color: string, alpha: number): void {
    // Un solo sombreado (del tamaño de la canica más grande), escalado a cada radio.
    const big = this.s * 0.48;
    const sprite = this.marbleShade(big);
    const k = r / big;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, px - (sprite.width / 2) * k, py - (sprite.height / 2) * k, sprite.width * k, sprite.height * k);
    ctx.globalAlpha = 1;
  }

  /** Dibuja la arena: el lienzo auxiliar escalado o, con celdas grandes, una canica por grano. */
  private drawSand(ctx: CanvasRenderingContext2D): void {
    const { hg, s } = this;
    if (this.sim instanceof MarbleSim) {
      // Canicas con física: cada una en su posición exacta, no en su celda.
      const sim = this.sim;
      for (let id = 0; id < sim.grainCount; id++) {
        if (!sim.bulb[id]) continue;
        const [c, faded] = this.colorOf(id);
        this.drawMarble(ctx, this.ox + sim.x[id] * s, this.oy + sim.y[id] * s, s * sim.rad[id] * 0.96, this.cssOf(c), faded ? 0.25 : 1);
      }
      return;
    }
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
    const { H } = hg;

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
    // Relieve: más oscura junto al vidrio y un poco más clara en la superficie.
    if (!this.marbles) {
      const relief = this.relief;
      const Wd = this.hg.W;
      for (let i = 0; i < grid.length; i++) {
        const c = buf[i];
        if (c === 0) continue;
        let k = relief[i];
        if (i >= Wd && grid[i - Wd] <= 0) k = (k * 290) >> 8;
        const r = Math.min(255, ((c & 0xff) * k) >> 8);
        const g = Math.min(255, (((c >>> 8) & 0xff) * k) >> 8);
        const b = Math.min(255, (((c >>> 16) & 0xff) * k) >> 8);
        buf[i] = ((c & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0;
      }
    }
    this.offCtx.putImageData(this.img, 0, 0);
    this.frameHl = hl;
    this.frameCut = cut;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawSurroundings();

    // Reloj girado: alrededor de su centro y, si hace falta, más pequeño para que quepa.
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

    // Vidrio (fondo): más claro hacia los bordes, como un cristal curvo visto de frente.
    ctx.fillStyle = theme.glassFill;
    ctx.fill(this.glass);
    this.drawGlassBack();

    ctx.save();
    ctx.clip(this.glass);
    this.drawSand(ctx);
    ctx.restore();

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
      if (this.sim instanceof MarbleSim) {
        this.drawMarble(ctx, px, py, s * 0.48, h.color, 1);
        continue;
      }
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.arc(px, py, this.grainRadius(), 0, Math.PI * 2);
      ctx.fill();
    }

    // Vidrio (delante): brillos curvos y un borde con grosor.
    this.drawGlassFront();

    // Tapas de madera, encima de los extremos del vidrio y de las columnas.
    this.drawCaps();

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

  /** Medidas del soporte en píxeles de dispositivo. */
  private frame() {
    const { s, dpr, hg } = this;
    const cx = this.ox + (hg.W / 2) * s;
    const glassHalf = (hg.maxHalf + 0.6) * s;
    const capH = CAP_CSS * dpr;
    // Las tapas sobresalen un poco del vidrio, como en un reloj de arena de verdad.
    const capHalf = glassHalf * 1.06 + 4 * dpr;
    return { cx, glassHalf, capH, capHalf, top: this.oy, bottom: this.oy + hg.H * s };
  }

  /** Luz ambiental detrás del reloj y su sombra en el suelo (no giran con él). */
  private drawSurroundings(): void {
    const { ctx, theme } = this;
    const f = this.frame();
    const midY = (f.top + f.bottom) / 2;
    const rad = Math.max(f.bottom - f.top, f.capHalf * 2) * 0.75;
    const amb = ctx.createRadialGradient(f.cx, midY, 0, f.cx, midY, rad);
    amb.addColorStop(0, theme.ambient);
    amb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = amb;
    ctx.fillRect(f.cx - rad, midY - rad, rad * 2, rad * 2);

    const sy = f.bottom + f.capH * 1.05;
    const sw = f.capHalf * 1.25;
    const sh = f.capH * 1.1;
    ctx.save();
    ctx.translate(f.cx, sy);
    ctx.scale(1, sh / sw);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, sw);
    shadow.addColorStop(0, theme.shadow);
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, sw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Fondo del vidrio: un poco más claro junto al borde (el cristal curvo refleja más ahí). */
  private drawGlassBack(): void {
    const { ctx } = this;
    const f = this.frame();
    ctx.save();
    ctx.clip(this.glass);
    const g = ctx.createLinearGradient(f.cx - f.glassHalf, 0, f.cx + f.glassHalf, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.82, 'rgba(255,255,255,0.02)');
    g.addColorStop(1, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(f.cx - f.glassHalf, f.top, f.glassHalf * 2, f.bottom - f.top);
    ctx.restore();
  }

  /** Delante de la arena: brillos curvos y el borde del vidrio con grosor. */
  private drawGlassFront(): void {
    const { ctx, theme, dpr } = this;
    const f = this.frame();
    ctx.save();
    ctx.clip(this.glass);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const { path, width, y0, y1, alpha } of this.shine) {
      // Un reflejo ancho y suave que se desvanece por los extremos, con un núcleo algo más vivo.
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.3, theme.glassShine);
      g.addColorStop(0.75, theme.glassShine);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.globalAlpha = 0.55 * alpha;
      ctx.lineWidth = width;
      ctx.stroke(path);
      ctx.globalAlpha = 0.5 * alpha;
      ctx.lineWidth = width * 0.3;
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
    // Cara interior del borde: una franja clara muy fina que da grosor al cristal.
    const rim = Math.max(1 * dpr, Math.min(2.5 * dpr, f.glassHalf * 0.012));
    ctx.lineWidth = rim * 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.stroke(this.glass);
    ctx.restore();

    ctx.lineJoin = 'round';
    ctx.lineWidth = rim;
    ctx.strokeStyle = theme.glassEdge;
    ctx.stroke(this.glass);
  }

  /** Tapas: sobrias, con algo de volumen (más claras arriba y un canto iluminado). */
  private drawCaps(): void {
    const { ctx, theme, dpr } = this;
    const f = this.frame();
    for (const y of [f.top - f.capH, f.bottom]) {
      const x = f.cx - f.capHalf;
      const w = f.capHalf * 2;
      const h = f.capH;
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, theme.capEdge);
      g.addColorStop(0.5, theme.cap);
      g.addColorStop(1, theme.cap);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h * 0.4);
      ctx.fill();
      ctx.lineWidth = Math.max(1, dpr);
      ctx.strokeStyle = theme.capEdge;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + h * 0.4, y + Math.max(1, dpr), w - h * 0.8, Math.max(1, dpr));
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
