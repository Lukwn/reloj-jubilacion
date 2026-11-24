import { hash32 } from './phrases';
import { groupOfGrain, type GrainSet } from './units';

export interface AltFrame {
  time: number;
  landed: number;
  selected: number;
  hovered: number;
  layersOn: boolean;
  highlightYear: number;
  cutoff: number;
  milestoneIds: number[];
  reducedMotion: boolean;
}

interface StackSpec {
  /** Posición normalizada X (-1..1) y profundidad Y (0 = fondo, 1 = primer plano). */
  nx: number;
  ny: number;
  /** Altura relativa en el racimo (como en una foto de pilas de monedas). */
  relH: number;
  /** Orden cronológico en el que se va llenando la pila. */
  fillOrder: number;
}

/**
 * Racimo orgánico de 13 pilas en 3 planos de profundidad:
 * 3 torres altas lado a lado al fondo, pilas medias a los lados y cortas en primer plano.
 */
const CLUSTER: ReadonlyArray<StackSpec> = [
  // Fondo (3 torres altas lado a lado)
  { nx: -0.54, ny: 0.08, relH: 1.14, fillOrder: 1 },
  { nx: 0.0, ny: 0.02, relH: 1.38, fillOrder: 0 },
  { nx: 0.54, ny: 0.06, relH: 1.24, fillOrder: 2 },
  // Plano medio-fondo (hombros laterales)
  { nx: -0.92, ny: 0.34, relH: 0.72, fillOrder: 4 },
  { nx: -0.44, ny: 0.42, relH: 0.86, fillOrder: 3 },
  { nx: 0.46, ny: 0.4, relH: 0.84, fillOrder: 5 },
  { nx: 0.92, ny: 0.34, relH: 0.68, fillOrder: 6 },
  // Plano medio-delantero
  { nx: -0.22, ny: 0.64, relH: 0.56, fillOrder: 7 },
  { nx: 0.24, ny: 0.62, relH: 0.6, fillOrder: 8 },
  { nx: 0.72, ny: 0.66, relH: 0.52, fillOrder: 9 },
  // Primer plano (pilas cortas escalonadas)
  { nx: -0.66, ny: 0.84, relH: 0.46, fillOrder: 10 },
  { nx: -0.14, ny: 0.96, relH: 0.32, fillOrder: 11 },
  { nx: 0.38, ny: 0.88, relH: 0.42, fillOrder: 12 },
];

interface MetalPalette {
  rimDark: string;
  rimMid: string;
  rimBright: string;
  rimSpec: string;
  faceLight: string;
  faceMid: string;
  faceDark: string;
  groove: string;
}

const GOLD_PALETTE: MetalPalette = {
  rimDark: '#4f2c05',
  rimMid: '#c6871b',
  rimBright: '#f5cb5c',
  rimSpec: '#fff6be',
  faceLight: '#fff3a8',
  faceMid: '#e8ae32',
  faceDark: '#9e620c',
  groove: 'rgba(65, 34, 4, 0.34)',
};

const EXTRA_PALETTE: MetalPalette = {
  rimDark: '#6b4208',
  rimMid: '#e3a82d',
  rimBright: '#ffe37a',
  rimSpec: '#ffffff',
  faceLight: '#fffbe0',
  faceMid: '#ffd257',
  faceDark: '#bf7e14',
  groove: 'rgba(92, 52, 6, 0.28)',
};

/** Paletas metálicas anodizadas para «Capas por años» (manteniendo brillo metálico real). */
const LAYER_METALS: ReadonlyArray<MetalPalette> = [
  GOLD_PALETTE,
  { rimDark: '#592519', rimMid: '#c86a4b', rimBright: '#f2a485', rimSpec: '#ffe1d4', faceLight: '#ffd2bd', faceMid: '#db7a58', faceDark: '#8c3d25', groove: 'rgba(68,24,14,0.34)' },
  { rimDark: '#234433', rimMid: '#4f9973', rimBright: '#8ad4ad', rimSpec: '#d4f7e4', faceLight: '#c2f0d6', faceMid: '#5eb086', faceDark: '#30664a', groove: 'rgba(18,48,32,0.34)' },
  { rimDark: '#1c3952', rimMid: '#4a84b5', rimBright: '#89c0eb', rimSpec: '#d8eeff', faceLight: '#c7e5fc', faceMid: '#5b97c9', faceDark: '#295780', groove: 'rgba(16,38,60,0.34)' },
  { rimDark: '#574a2c', rimMid: '#c4b17e', rimBright: '#ede0b9', rimSpec: '#fffbe8', faceLight: '#faf2d4', faceMid: '#d6c38d', faceDark: '#877548', groove: 'rgba(58,48,22,0.3)' },
  { rimDark: '#363c4a', rimMid: '#8a94a8', rimBright: '#ccd5e6', rimSpec: '#ffffff', faceLight: '#edf2fa', faceMid: '#a5b0c4', faceDark: '#5a6375', groove: 'rgba(30,36,48,0.32)' },
  { rimDark: '#54263b', rimMid: '#b55d82', rimBright: '#e899ba', rimSpec: '#ffdbe9', faceLight: '#f7c8dc', faceMid: '#c96f95', faceDark: '#7d3454', groove: 'rgba(62,20,38,0.34)' },
  { rimDark: '#382a54', rimMid: '#7c64b0', rimBright: '#b5a0e3', rimSpec: '#e8dfff', faceLight: '#d9ccfa', faceMid: '#8e77c4', faceDark: '#4f3a7d', groove: 'rgba(36,24,62,0.34)' },
];

interface StackState {
  spec: StackSpec;
  /** Coordenadas de la base en píxeles de dispositivo. */
  bx: number;
  by: number;
  /** IDs de las monedas de esta pila, de abajo arriba. */
  ids: number[];
}

interface CoinGeom {
  stackIdx: number;
  row: number;
  year: number;
  extra: boolean;
  /** Micro-desplazamiento natural de apilado a mano (-1..1). */
  restOx: number;
}

/** Estado físico de cada moneda. */
const MODE_STACKED = 0;
const MODE_LOOSE = 1;
const MODE_DRAGGED = 2;
const MODE_RETURNING = 3;

const TOP_RESERVE = 64;
const BOTTOM_RESERVE = 114;

/**
 * Vista de pilas de monedas metálicas en perspectiva 3D con físicas reales para «Nóminas».
 * - Solo dibuja las nóminas que ya llevas cobradas (sin siluetas fantasma).
 * - Al darle a Play, las monedas nuevas caen desde arriba con gravedad, rebote y tintineo.
 * - Puedes coger, arrastrar, lanzar o derribar tus monedas para desordenarlas sobre la mesa,
 *   y volver a apilarlas con «Apilar monedas» o doble clic.
 */
export class CoinsView {
  dpr = 1;
  topExtra = 0;
  /** Callback para disparar el tintineo metálico al chocar o aterrizar una moneda. */
  onClink: ((extra: boolean, strength: number) => void) | null = null;
  /** Avisa cuando las monedas pasan de ordenadas a desordenadas (o viceversa). */
  onMessyChange: ((messy: boolean) => void) | null = null;

  private ctx: CanvasRenderingContext2D;
  private stacks: StackState[] = [];
  private geom: CoinGeom[] = [];
  private rx = 32;
  private ry = 10;
  private thick = 4;
  private tableTopY = 300;
  private tableBotY = 540;
  private topLimitY = 70;
  private prevW = 0;
  private prevH = 0;

  // Estado físico absoluto por moneda (en píxeles de dispositivo).
  private mode: Uint8Array;
  private px: Float32Array;
  private py: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private rot: Float32Array;
  private vrot: Float32Array;
  /** Plano de profundidad (suelo de mesa) para monedas sueltas. */
  private floorY: Float32Array;
  /** Retardo de retorno escalonado al volver a apilar (ms). */
  private returnDelay: Float32Array;
  /** ID de la moneda suelta sobre la que está apilada esta moneda (-1 = sobre la mesa). */
  private parent: Int32Array;
  /** Ligero desplazamiento horizontal respecto a la moneda inferior al apilar a mano. */
  private stackOffX: Float32Array;

  // Estado del arrastre con ratón o dedo.
  private dragIds: number[] = [];
  private dragOffX: number[] = [];
  private dragOffY: number[] = [];
  private dragPtrX = 0;
  private dragPtrY = 0;
  private dragVx = 0;
  private dragVy = 0;
  private dragLastMoveAt = 0;
  private swiping = false;
  /** Moneda suelta resaltada como destino de apilado mientras arrastras. */
  private snapPreviewId = -1;

  private isLight = false;
  private prevLanded = 0;
  private lastTime = 0;
  private lastClinkAt = 0;
  private tiltAngle = 0;
  private lastMessy = false;

  /** Orden de pintado (back-to-front) reutilizado para hit-testing inverso exacto. */
  private drawOrder: number[] = [];

  private spriteCache = new Map<string, HTMLCanvasElement>();
  private spriteSizeKey = '';

  constructor(
    private canvas: HTMLCanvasElement,
    private grains: GrainSet,
    initialLanded: number,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.prevLanded = initialLanded;
    const n = grains.total;
    this.mode = new Uint8Array(n);
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.vrot = new Float32Array(n);
    this.floorY = new Float32Array(n);
    this.returnDelay = new Float32Array(n);
    this.parent = new Int32Array(n).fill(-1);
    this.stackOffX = new Float32Array(n);
    this.assignStacks();
    this.refreshTheme();
    this.resize();
    this.snapAllToHome();
  }

  /** Reparte las N nóminas en las pilas del racimo manteniendo la suma exacta = grains.total. */
  private assignStacks(): void {
    const n = this.grains.total;
    const count = Math.min(CLUSTER.length, Math.max(5, Math.round(n / 42)));
    const chosen = [...CLUSTER]
      .sort((a, b) => a.fillOrder - b.fillOrder)
      .slice(0, count);

    const sumH = chosen.reduce((acc, s) => acc + s.relH, 0);
    const caps = chosen.map((s) => Math.max(1, Math.round((s.relH / sumH) * n)));
    let diff = n - caps.reduce((a, b) => a + b, 0);
    for (let i = 0; diff !== 0; i = (i + 1) % caps.length) {
      if (diff > 0) {
        caps[i]++;
        diff--;
      } else if (caps[i] > 1) {
        caps[i]--;
        diff++;
      }
    }

    const built: StackState[] = chosen.map((spec) => ({ spec, bx: 0, by: 0, ids: [] }));
    let id = 0;
    for (let si = 0; si < built.length; si++) {
      for (let k = 0; k < caps[si] && id < n; k++) built[si].ids.push(id++);
    }
    built.sort((a, b) => a.spec.ny - b.spec.ny);
    this.stacks = built;

    this.geom = new Array(n);
    for (let si = 0; si < built.length; si++) {
      const st = built[si];
      for (let row = 0; row < st.ids.length; row++) {
        const cid = st.ids[row];
        const h = hash32(cid * 7919 + 137);
        const jitter = ((h & 0xff) / 255 - 0.5) * 2; // -1..1
        this.geom[cid] = {
          stackIdx: si,
          row,
          year: groupOfGrain(this.grains, cid),
          extra: !!this.grains.extra?.[cid],
          restOx: jitter,
        };
      }
    }
  }

  private homeX(id: number): number {
    const g = this.geom[id];
    const st = this.stacks[g.stackIdx];
    return st.bx + g.restOx * this.rx * 0.045;
  }

  private homeY(id: number): number {
    const g = this.geom[id];
    const st = this.stacks[g.stackIdx];
    return st.by - g.row * this.thick - this.thick;
  }

  private snapAllToHome(): void {
    const n = this.grains.total;
    for (let id = 0; id < n; id++) {
      this.mode[id] = MODE_STACKED;
      this.px[id] = this.homeX(id);
      this.py[id] = this.homeY(id);
      this.vx[id] = 0;
      this.vy[id] = 0;
      this.rot[id] = 0;
      this.vrot[id] = 0;
      this.floorY[id] = this.stacks[this.geom[id].stackIdx].by;
      this.returnDelay[id] = 0;
      this.parent[id] = -1;
      this.stackOffX[id] = 0;
    }
    this.snapPreviewId = -1;
    this.reportMessy(false);
  }

  /** Devuelve la moneda raíz (sobre la mesa) de una pila libre formada por el usuario. */
  private looseRoot(id: number): number {
    let cur = id;
    for (let guard = 0; guard < 128; guard++) {
      const p = this.parent[cur];
      if (p < 0 || this.mode[p] !== MODE_LOOSE) return cur;
      cur = p;
    }
    return cur;
  }

  /** Profundidad (0 = en mesa, 1 = sobre 1 moneda, ...) dentro de una pila libre. */
  private looseDepth(id: number): number {
    let d = 0;
    let cur = id;
    for (let guard = 0; guard < 128; guard++) {
      const p = this.parent[cur];
      if (p < 0 || this.mode[p] !== MODE_LOOSE) return d;
      cur = p;
      d++;
    }
    return d;
  }

  /** Moneda directamente apoyada encima de `id` en una pila libre, o -1. */
  private looseChildOf(id: number): number {
    for (let cid = 0; cid < this.prevLanded; cid++) {
      if (this.mode[cid] === MODE_LOOSE && this.parent[cid] === id) return cid;
    }
    return -1;
  }

  /** Cadena ordenada de monedas apiladas por encima de `id` en una pila libre. */
  private looseChainAbove(id: number): number[] {
    const out: number[] = [];
    let cur = id;
    for (let guard = 0; guard < 128; guard++) {
      const child = this.looseChildOf(cur);
      if (child < 0) break;
      out.push(child);
      cur = child;
    }
    return out;
  }

  /** Busca la moneda suelta superior más cercana bajo (x, y) sobre la que se pueda apilar. */
  private findLooseSnapTarget(x: number, y: number, exclude: Set<number>): number {
    let best = -1;
    let bestScore = Infinity;
    const reachX = this.rx * 1.1;
    for (let cid = 0; cid < this.prevLanded; cid++) {
      if (exclude.has(cid) || this.mode[cid] !== MODE_LOOSE) continue;
      if (Math.abs(this.vy[cid]) > 0.16 * this.dpr) continue;
      if (this.looseChildOf(cid) >= 0) continue; // Solo apilar sobre la cima de cada pila libre.
      const dx = Math.abs(x - this.px[cid]);
      if (dx > reachX) continue;
      const dy = this.py[cid] - y;
      // Permite soltar justo encima (dy >= -ry * 1.5) hasta un par de radios más arriba.
      if (dy < -this.ry * 1.5 || dy > this.rx * 2.5) continue;
      const score = dx + Math.abs(dy) * 0.45;
      if (score < bestScore) {
        bestScore = score;
        best = cid;
      }
    }
    return best;
  }

  private emitClink(extra: boolean, strength: number): void {
    const now = performance.now();
    if (now - this.lastClinkAt < 28) return;
    this.lastClinkAt = now;
    this.onClink?.(extra, Math.max(0.08, Math.min(1, strength)));
  }

  private reportMessy(messy: boolean): void {
    if (messy === this.lastMessy) return;
    this.lastMessy = messy;
    this.onMessyChange?.(messy);
  }

  hasMessyCoins(): boolean {
    const n = this.prevLanded;
    const thresh = this.rx * 0.14;
    for (let id = 0; id < n; id++) {
      const m = this.mode[id];
      if (m === MODE_LOOSE || m === MODE_DRAGGED) return true;
      if (m === MODE_STACKED && Math.abs(this.px[id] - this.homeX(id)) > thresh) return true;
    }
    return false;
  }

  refreshTheme(): void {
    this.isLight = matchMedia('(prefers-color-scheme: light)').matches;
    this.spriteCache.clear();
  }

  resize(cssW = window.innerWidth, cssH = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 3)): void {
    const oldW = this.prevW;
    const oldH = this.prevH;
    this.dpr = dpr;
    const W = Math.round(cssW * dpr);
    const H = Math.round(cssH * dpr);
    this.canvas.width = W;
    this.canvas.height = H;
    this.computeLayout(cssW, cssH, dpr);

    // Reajustar posiciones existentes si ya se había inicializado el lienzo.
    if (oldW > 0 && oldH > 0) {
      const sx = W / oldW;
      const sy = H / oldH;
      const marginX = this.rx + 8 * dpr;
      for (let id = 0; id < this.grains.total; id++) {
        if (this.mode[id] === MODE_STACKED) {
          // Mantener si estaba cayendo por encima o ligeramente torcida.
          const oldHomeX = this.homeX(id);
          const oldHomeY = this.homeY(id);
          if (id >= this.prevLanded) {
            this.px[id] = oldHomeX;
            this.py[id] = oldHomeY;
          } else {
            this.px[id] = Math.max(marginX, Math.min(W - marginX, this.px[id] * sx));
            this.py[id] = Math.min(oldHomeY, this.py[id] * sy);
          }
        } else {
          this.px[id] = Math.max(marginX, Math.min(W - marginX, this.px[id] * sx));
          this.py[id] = Math.max(this.topLimitY, Math.min(this.tableBotY, this.py[id] * sy));
          this.floorY[id] = Math.max(this.tableTopY, Math.min(this.tableBotY, this.floorY[id] * sy));
        }
      }
    }
    this.prevW = W;
    this.prevH = H;
  }

  private computeLayout(cssW: number, cssH: number, dpr: number): void {
    const W = cssW * dpr;
    const H = cssH * dpr;
    const top = (TOP_RESERVE + this.topExtra + 18) * dpr;
    const bot = (BOTTOM_RESERVE + 18) * dpr;
    const availW = Math.max(180 * dpr, (cssW - 28) * dpr);
    const availH = Math.max(160 * dpr, H - top - bot);

    const maxStackCoins = Math.max(1, ...this.stacks.map((s) => s.ids.length));
    const maxRxW = Math.min(availW * 0.135, 56 * dpr);
    const rx = Math.max(16 * dpr, maxRxW);
    const ry = rx * 0.31;

    const depthSpan = Math.min(availH * 0.2, ry * 5.2);
    const maxTowerH = availH - depthSpan - ry * 2.4;
    const thick = Math.max(2.2 * dpr, Math.min(rx * 0.155, maxTowerH / maxStackCoins));

    this.rx = rx;
    this.ry = ry;
    this.thick = thick;
    this.topLimitY = top - ry;

    const sizeKey = `${Math.round(rx)}x${Math.round(ry)}x${Math.round(thick * 10)}`;
    if (sizeKey !== this.spriteSizeKey) {
      this.spriteCache.clear();
      this.spriteSizeKey = sizeKey;
    }

    const cx = W / 2;
    const spreadX = Math.min(availW * 0.48 - rx, rx * 3.4);
    const totalVisualH = maxStackCoins * thick + depthSpan + ry * 2;
    const groundBackY = top + Math.max(0, (availH - totalVisualH) * 0.55) + maxStackCoins * thick + ry;

    this.tableTopY = groundBackY - ry * 1.4;
    this.tableBotY = Math.min(H - bot + ry * 0.3, groundBackY + depthSpan + ry * 2.2);

    for (const st of this.stacks) {
      st.bx = cx + st.spec.nx * spreadX;
      st.by = groundBackY + st.spec.ny * depthSpan;
    }
  }

  /** Registra nuevas nóminas caídas: caen desde arriba con gravedad real, inclinación y rebote. */
  notifyLanded(newLanded: number, _now: number, reducedMotion: boolean): void {
    if (newLanded < this.prevLanded || reducedMotion) {
      this.prevLanded = newLanded;
      this.snapAllToHome();
      return;
    }
    const startId = Math.max(this.prevLanded, newLanded - 24);
    // Colocar las anteriores (si hubiera un salto grande) ya posadas en su pila.
    for (let id = this.prevLanded; id < startId; id++) {
      this.mode[id] = MODE_STACKED;
      this.px[id] = this.homeX(id);
      this.py[id] = this.homeY(id);
      this.vx[id] = 0;
      this.vy[id] = 0;
      this.rot[id] = 0;
      this.vrot[id] = 0;
    }
    const dropSpan = Math.max(110 * this.dpr, this.rx * 3.4);
    for (let id = startId; id < newLanded; id++) {
      const hx = this.homeX(id);
      const hy = this.homeY(id);
      const stagger = (id - startId) * this.thick * 3.2;
      this.mode[id] = MODE_STACKED;
      this.px[id] = hx + (Math.random() - 0.5) * this.rx * 0.28;
      this.py[id] = Math.min(hy - dropSpan, this.topLimitY - this.ry * 2) - stagger;
      this.vx[id] = (hx - this.px[id]) * 0.004;
      this.vy[id] = (0.14 + Math.random() * 0.08) * this.dpr;
      this.rot[id] = (Math.random() - 0.5) * 0.24;
      this.vrot[id] = (Math.random() - 0.5) * 0.005;
      this.floorY[id] = this.stacks[this.geom[id].stackIdx].by;
    }
    this.prevLanded = newLanded;
  }

  /** Convierte una moneda en suelta sobre la mesa con velocidad y plano de suelo natural. */
  private releaseToLoose(id: number, vx: number, vy: number, vrot: number, preferredFloorY?: number): void {
    this.mode[id] = MODE_LOOSE;
    this.parent[id] = -1;
    this.stackOffX[id] = 0;
    this.vx[id] = vx;
    this.vy[id] = vy;
    this.vrot[id] = vrot;
    const h = hash32(id * 2654435761 + Math.round(this.px[id]));
    const rand = (h & 0xffff) / 0xffff;
    const base = preferredFloorY ?? this.stacks[this.geom[id].stackIdx].by + (rand - 0.35) * this.ry * 4.2;
    this.floorY[id] = Math.max(this.tableTopY, Math.min(this.tableBotY, base));
  }

  /** Apila una moneda suelta `id` directamente encima de otra moneda suelta `below`. */
  private attachToLoose(id: number, below: number, vx: number, vy: number): void {
    const root = this.looseRoot(below);
    this.mode[id] = MODE_LOOSE;
    this.parent[id] = below;
    const rawOff = this.px[id] - this.px[below];
    const maxOff = this.rx * 0.24;
    this.stackOffX[id] = Math.max(-maxOff, Math.min(maxOff, rawOff * 0.55));
    this.floorY[id] = this.floorY[root];
    this.vx[id] = vx;
    this.vy[id] = Math.max(0, vy);
    this.vrot[id] = 0;
  }

  /** Inicia un arrastre: agarra una moneda/bloque si pulsaste sobre ella, o activa barrido para mover/empujar pilas. */
  beginDrag(cssX: number, cssY: number): boolean {
    const px = cssX * this.dpr;
    const py = cssY * this.dpr;
    this.dragPtrX = px;
    this.dragPtrY = py;
    this.dragVx = 0;
    this.dragVy = 0;
    this.dragLastMoveAt = performance.now();
    this.dragIds = [];
    this.dragOffX = [];
    this.dragOffY = [];
    this.snapPreviewId = -1;

    const hitId = this.pick(cssX, cssY);
    if (hitId < 0) {
      this.swiping = true;
      return false;
    }

    this.swiping = false;
    const picked: number[] = [hitId];

    // Si está en una pila ordenada y hay pocas monedas encima (<= 5), levantas ese mini-bloque entero.
    // Si hay muchas encima, la sacas del medio estilo Jenga y las de arriba se asientan suavemente.
    if (this.mode[hitId] === MODE_STACKED) {
      const g = this.geom[hitId];
      const st = this.stacks[g.stackIdx];
      const above: number[] = [];
      for (let r = g.row + 1; r < st.ids.length; r++) {
        const cid = st.ids[r];
        if (cid >= this.prevLanded) break;
        if (this.mode[cid] === MODE_STACKED) above.push(cid);
      }
      if (above.length > 0 && above.length <= 5) {
        picked.push(...above);
      } else if (above.length > 5) {
        for (let i = 0; i < above.length; i++) {
          const cid = above[i];
          this.vx[cid] += (Math.random() - 0.5) * 0.05 * this.dpr;
          this.vrot[cid] += (Math.random() - 0.5) * 0.0008;
        }
      }
    } else if (this.mode[hitId] === MODE_LOOSE) {
      // Si es parte de una pila libre creada por el usuario, levantarla igual de natural.
      const above = this.looseChainAbove(hitId);
      if (above.length > 0 && above.length <= 5) {
        picked.push(...above);
      } else if (above.length > 5) {
        // Estilo Jenga: reconectar el bloque superior a lo que había debajo de hitId.
        this.parent[above[0]] = this.parent[hitId];
      }
    }

    for (const cid of picked) {
      this.mode[cid] = MODE_DRAGGED;
      this.parent[cid] = -1;
      this.stackOffX[cid] = 0;
      this.vx[cid] = 0;
      this.vy[cid] = 0;
      this.vrot[cid] = 0;
      this.dragIds.push(cid);
      this.dragOffX.push(this.px[cid] - px);
      this.dragOffY.push(this.py[cid] - py);
    }
    this.emitClink(this.geom[hitId].extra, 0.4);
    this.reportMessy(true);
    return true;
  }

  /** Mueve las monedas agarradas suavemente (mostrando destino de apilado) o empuja pilas al barrer desde fuera. */
  moveDrag(cssX: number, cssY: number, dxCss: number, dyCss: number): void {
    const now = performance.now();
    const dtMove = Math.max(8, Math.min(48, now - this.dragLastMoveAt));
    this.dragLastMoveAt = now;

    const ptrX = cssX * this.dpr;
    const ptrY = cssY * this.dpr;
    const dx = dxCss * this.dpr;
    const dy = dyCss * this.dpr;
    this.dragPtrX = ptrX;
    this.dragPtrY = ptrY;

    const maxTrackV = 1.1 * this.dpr;
    const instVx = Math.max(-maxTrackV, Math.min(maxTrackV, dx / dtMove));
    const instVy = Math.max(-maxTrackV, Math.min(maxTrackV, dy / dtMove));
    this.dragVx = this.dragVx * 0.65 + instVx * 0.35;
    this.dragVy = this.dragVy * 0.65 + instVy * 0.35;

    if (this.dragIds.length > 0) {
      const marginX = this.rx + 4 * this.dpr;
      const W = this.canvas.width;
      const H = this.canvas.height;
      for (let i = 0; i < this.dragIds.length; i++) {
        const cid = this.dragIds[i];
        const follow = i === 0 ? 0.88 : Math.max(0.5, 0.84 - i * 0.07);
        const tx = Math.max(marginX, Math.min(W - marginX, ptrX + this.dragOffX[i]));
        const ty = Math.max(this.topLimitY, Math.min(H - this.ry * 2, ptrY + this.dragOffY[i]));
        this.px[cid] += (tx - this.px[cid]) * follow;
        this.py[cid] += (ty - this.py[cid]) * follow;
        const targetRot = Math.max(-0.22, Math.min(0.22, this.dragVx * 0.16));
        this.rot[cid] += (targetRot - this.rot[cid]) * 0.25;
      }
      // Detectar si estamos sobre una moneda suelta para apilarla encima al soltar.
      const baseId = this.dragIds[0];
      this.snapPreviewId = this.findLooseSnapTarget(this.px[baseId], this.py[baseId], new Set(this.dragIds));
      return;
    }

    if (this.swiping) {
      this.knockAt(ptrX, ptrY, instVx, instVy, false);
    }
  }

  /** Suelta las monedas agarradas: si hay otra moneda suelta debajo, se apilan limpiamente encima. */
  endDrag(): void {
    this.snapPreviewId = -1;
    if (this.dragIds.length > 0) {
      const stale = performance.now() - this.dragLastMoveAt > 90;
      const maxV = 0.58 * this.dpr;
      const tvx = stale ? 0 : Math.max(-maxV, Math.min(maxV, this.dragVx * 0.42));
      const tvy = stale ? 0 : Math.max(-maxV * 0.75, Math.min(maxV * 0.75, this.dragVy * 0.32));
      const calmDrop = Math.hypot(tvx, tvy) < 0.3 * this.dpr;
      const baseId = this.dragIds[0];
      const snapTarget = calmDrop ? this.findLooseSnapTarget(this.px[baseId], this.py[baseId], new Set(this.dragIds)) : -1;

      if (snapTarget >= 0) {
        // Apilar limpiamente sobre la moneda suelta (o torre libre) que hay debajo.
        this.attachToLoose(baseId, snapTarget, tvx * 0.2, Math.max(0.06 * this.dpr, tvy * 0.3));
        for (let i = 1; i < this.dragIds.length; i++) {
          this.attachToLoose(this.dragIds[i], this.dragIds[i - 1], tvx * 0.15, Math.max(0.05 * this.dpr, tvy * 0.25));
        }
      } else {
        // Soltar sobre la mesa: si llevabas un bloque en calma, mantiene su mini-torre intacta.
        const releaseFloor =
          this.py[baseId] >= this.tableTopY
            ? Math.min(this.tableBotY, this.py[baseId] + this.thick * 1.2)
            : this.tableTopY + (0.2 + Math.random() * 0.6) * (this.tableBotY - this.tableTopY);
        const spin0 = Math.max(-0.004, Math.min(0.004, tvx * 0.003));
        this.releaseToLoose(baseId, tvx + (Math.random() - 0.5) * 0.04 * this.dpr, tvy, spin0, releaseFloor);

        const keepMiniStack = this.dragIds.length > 1 && Math.hypot(tvx, tvy) < 0.24 * this.dpr;
        for (let i = 1; i < this.dragIds.length; i++) {
          const cid = this.dragIds[i];
          if (keepMiniStack) {
            this.attachToLoose(cid, this.dragIds[i - 1], tvx * 0.25, tvy * 0.3);
          } else {
            const spreadVx = tvx + (Math.random() - 0.5) * 0.08 * this.dpr;
            const spin = Math.max(-0.004, Math.min(0.004, spreadVx * 0.003));
            const floorI = Math.min(this.tableBotY, releaseFloor + this.thick * i * 0.5);
            this.releaseToLoose(cid, spreadVx, tvy, spin, floorI);
          }
        }
      }

      this.dragIds = [];
      this.dragOffX = [];
      this.dragOffY = [];
      this.reportMessy(true);
    }
    this.swiping = false;
  }

  /** Empuja o desordena monedas al pasar arrastrando por encima (velocidad acotada a la de tu mano). */
  private knockAt(px: number, py: number, ptrVx: number, ptrVy: number, fromHeldCoin: boolean): void {
    const speed = Math.hypot(ptrVx, ptrVy);
    if (speed < 0.04 * this.dpr) return;

    const cap = (fromHeldCoin ? 0.32 : 0.48) * this.dpr;
    const targetVx = Math.max(-cap, Math.min(cap, ptrVx * 0.55));
    const targetVy = Math.max(-cap * 0.5, Math.min(cap * 0.5, ptrVy * 0.3));
    const reachX = this.rx * (fromHeldCoin ? 1.15 : 1.2);
    const reachY = Math.max(this.ry * 1.9, this.thick * 4.5);
    const fastSwipe = !fromHeldCoin && speed > 0.85 * this.dpr;
    let touched = false;

    for (let id = 0; id < this.prevLanded; id++) {
      const m = this.mode[id];
      if (m === MODE_DRAGGED || m === MODE_RETURNING) continue;
      const distX = Math.abs(px - this.px[id]);
      const distY = Math.abs(py - this.py[id]);
      if (distX > reachX || distY > reachY) continue;

      const factor = (1 - distX / reachX) * (1 - distY / reachY);
      const blend = 0.25 + 0.35 * factor;
      touched = true;

      if (m === MODE_STACKED) {
        this.vx[id] += (targetVx - this.vx[id]) * blend;
        this.vrot[id] += (targetVx * 0.0012 - this.vrot[id]) * 0.25;
        const offset = Math.abs(this.px[id] + this.vx[id] * 16 - this.homeX(id));
        if (fastSwipe || offset > this.rx * 0.52) {
          this.releaseToLoose(
            id,
            this.vx[id] * 0.78 + (Math.random() - 0.5) * 0.06 * this.dpr,
            Math.min(0, targetVy * 0.4 - 0.05 * this.dpr),
            targetVx * 0.0025,
          );
          const g = this.geom[id];
          const st = this.stacks[g.stackIdx];
          for (let r = g.row + 1; r < st.ids.length; r++) {
            const aid = st.ids[r];
            if (aid >= this.prevLanded) break;
            if (this.mode[aid] !== MODE_STACKED) continue;
            const decay = Math.exp(-(r - g.row) * 0.24);
            this.vx[aid] += (targetVx * 0.55 * decay - this.vx[aid]) * 0.35;
            if (fastSwipe && decay > 0.5) {
              this.releaseToLoose(
                aid,
                this.vx[aid] * 0.7 + (Math.random() - 0.5) * 0.08 * this.dpr,
                -0.03 * this.dpr * decay,
                (Math.random() - 0.5) * 0.003,
              );
            }
          }
        }
      } else if (m === MODE_LOOSE) {
        this.vx[id] += (targetVx * 0.85 - this.vx[id]) * blend;
        this.vrot[id] += (targetVx * 0.0015 - this.vrot[id]) * 0.25;
        if (this.parent[id] >= 0) {
          // Si golpeas una moneda de una torre libre, se desprende al desplazarse o con barrido rápido.
          const p = this.parent[id];
          if (fastSwipe || Math.abs(this.px[id] + this.vx[id] * 16 - this.px[p]) > this.rx * 0.48) {
            const above = this.looseChainAbove(id);
            this.releaseToLoose(id, this.vx[id] * 0.85, -0.04 * this.dpr, targetVx * 0.0025, this.floorY[id]);
            for (const aid of above) {
              this.releaseToLoose(aid, this.vx[id] * 0.65 + (Math.random() - 0.5) * 0.08 * this.dpr, -0.02 * this.dpr, (Math.random() - 0.5) * 0.003, this.floorY[id]);
            }
          }
        } else {
          this.floorY[id] = Math.max(this.tableTopY, Math.min(this.tableBotY, this.floorY[id] + ptrVy * 10 * factor));
        }
      }
      this.emitClink(this.geom[id].extra, Math.min(0.8, speed / (1.2 * this.dpr)));
    }

    if (touched) this.reportMessy(true);
  }

  /** Vuelve a apilar suavemente todas las monedas desordenadas en sus torres ordenadas. */
  tidy(): void {
    this.dragIds = [];
    this.swiping = false;
    this.snapPreviewId = -1;
    let maxDelay = 0;
    for (let id = 0; id < this.prevLanded; id++) {
      this.parent[id] = -1;
      this.stackOffX[id] = 0;
      const m = this.mode[id];
      const crooked = m === MODE_STACKED && Math.abs(this.px[id] - this.homeX(id)) > this.rx * 0.08;
      if (m !== MODE_STACKED || crooked) {
        this.mode[id] = MODE_RETURNING;
        this.vx[id] = 0;
        this.vy[id] = 0;
        this.vrot[id] = 0;
        const g = this.geom[id];
        const delay = Math.min(240, g.row * 4 + g.stackIdx * 10);
        this.returnDelay[id] = delay;
        if (delay > maxDelay) maxDelay = delay;
      }
    }
    if (maxDelay >= 0) this.emitClink(true, 0.75);
  }

  /** Envía un temblor físico a todas las pilas (sacudir el móvil o doble clic cuando están ordenadas). */
  tremor(strength = 1): void {
    const s = Math.max(0.2, Math.min(1.5, strength));
    let disturbed = false;
    for (const st of this.stacks) {
      const dir = (Math.random() < 0.5 ? -1 : 1) * s;
      const earned = st.ids.filter((id) => id < this.prevLanded && this.mode[id] === MODE_STACKED);
      const topN = earned.length;
      for (let r = 0; r < topN; r++) {
        const id = earned[r];
        const frac = (r + 1) / Math.max(1, topN);
        this.vx[id] += dir * (0.09 + frac * 0.22) * this.dpr * (0.7 + Math.random() * 0.5);
        this.vrot[id] += dir * frac * 0.0007;
        if (r >= topN - 2 && s >= 0.9) {
          this.releaseToLoose(
            id,
            this.vx[id] * 0.75,
            -(0.12 + Math.random() * 0.1) * s * this.dpr,
            dir * 0.0025,
          );
          disturbed = true;
        }
      }
    }
    this.emitClink(true, Math.min(1, 0.7 * s));
    if (disturbed) this.reportMessy(true);
  }

  /** Inclinación lateral (p. ej. giroscopio): las pilas altas se ladean según su altura. */
  setTilt(angle: number): void {
    this.tiltAngle = angle;
  }

  /** Paso de física de todas las monedas cobradas (apiladas, sueltas y en retorno). */
  private stepPhysics(dt: number, landed: number): void {
    const g = 0.0046 * this.dpr; // gravedad (px/ms²)
    const W = this.canvas.width;
    const marginX = this.rx + 8 * this.dpr;
    const leanFactor = Math.sin(this.tiltAngle) * this.rx * 0.28;
    const stackFriction = Math.pow(0.7, dt / 16);
    const tableFriction = Math.pow(0.76, dt / 16);
    const rotDamp = Math.pow(0.8, dt / 16);

    let anyMessy = false;
    let anyReturning = false;

    // 0. Si el usuario sostiene monedas sin mover el ratón, suavizar su llegada y amortiguar la velocidad de lanzamiento.
    if (this.dragIds.length > 0) {
      const marginX = this.rx + 4 * this.dpr;
      const H = this.canvas.height;
      const idleDamp = Math.pow(0.74, dt / 16);
      this.dragVx *= idleDamp;
      this.dragVy *= idleDamp;
      for (let i = 0; i < this.dragIds.length; i++) {
        const cid = this.dragIds[i];
        const tx = Math.max(marginX, Math.min(W - marginX, this.dragPtrX + this.dragOffX[i]));
        const ty = Math.max(this.topLimitY, Math.min(H - this.ry * 2, this.dragPtrY + this.dragOffY[i]));
        this.px[cid] += (tx - this.px[cid]) * 0.35;
        this.py[cid] += (ty - this.py[cid]) * 0.35;
        this.rot[cid] *= idleDamp;
      }
    }

    // 1. Monedas APILADAS (MODE_STACKED): caen sobre la moneda apilada de abajo y conservan desalineación por fricción.
    for (const st of this.stacks) {
      let stackedCount = 0;
      let prevX = st.bx;
      const len = st.ids.length;
      for (let r = 0; r < len; r++) {
        const id = st.ids[r];
        if (id >= landed) break;
        if (this.mode[id] !== MODE_STACKED) continue;

        const restX = st.bx + this.geom[id].restOx * this.rx * 0.045 + (leanFactor * (stackedCount + 1)) / Math.max(12, len);
        const restY = st.by - stackedCount * this.thick - this.thick;
        stackedCount++;

        // Caída libre hacia su asiento actual en la pila (nuevas de Play o al sacar una de debajo).
        if (this.py[id] < restY - 0.5 || this.vy[id] !== 0) {
          this.vy[id] += g * dt;
          this.py[id] += this.vy[id] * dt;
          if (this.py[id] >= restY) {
            const impact = this.vy[id];
            this.py[id] = restY;
            if (impact > 0.16 * this.dpr) {
              this.vy[id] = -impact * 0.24;
              this.vx[id] += (Math.random() - 0.5) * impact * 0.12;
              this.vrot[id] += (Math.random() - 0.5) * 0.0014;
              this.emitClink(this.geom[id].extra, Math.min(1, impact / (0.9 * this.dpr)));
            } else {
              this.vy[id] = 0;
            }
          }
        } else {
          this.py[id] = restY;
        }

        // Si está cayendo desde arriba en Play, guiarla suavemente hacia su columna.
        if (this.py[id] < restY - this.thick * 1.5) {
          this.vx[id] += (restX - this.px[id]) * 0.00018 * dt;
          this.vx[id] *= Math.pow(0.92, dt / 16);
        } else {
          // Ya apoyada: fricción metálica real (se queda ligeramente torcida si la empujas suave, no rebota artificialmente).
          this.vx[id] *= stackFriction;
          if (Math.abs(this.vx[id]) < 0.004) this.vx[id] = 0;
        }
        this.px[id] += this.vx[id] * dt;

        // Si se desplaza demasiado respecto a la moneda de debajo, pierde el equilibrio y cae suelta junto a la pila.
        const overhang = this.px[id] - prevX;
        if (stackedCount > 1 && Math.abs(overhang) > this.rx * 0.56 && this.py[id] >= restY - this.thick) {
          const tipVx = Math.max(-0.26 * this.dpr, Math.min(0.26 * this.dpr, this.vx[id])) + Math.sign(overhang) * 0.1 * this.dpr;
          this.releaseToLoose(id, tipVx, 0, Math.sign(overhang) * 0.0028);
          anyMessy = true;
          continue;
        }

        // Inclinación amortiguada.
        const aRot = -this.rot[id] * 0.003;
        this.vrot[id] = (this.vrot[id] + aRot * dt) * rotDamp;
        this.rot[id] = Math.max(-0.22, Math.min(0.22, this.rot[id] + this.vrot[id] * dt));
        if (Math.abs(this.rot[id]) < 0.001 && Math.abs(this.vrot[id]) < 0.00015) {
          this.rot[id] = 0;
          this.vrot[id] = 0;
        }

        if (Math.abs(this.px[id] - this.homeX(id)) > this.rx * 0.14) anyMessy = true;
        prevX = this.px[id];
      }
    }

    // 2. Monedas SUELTAS (MODE_LOOSE) procesadas de abajo arriba (raíces primero, luego apiladas) y EN RETORNO.
    const looseIds: number[] = [];
    for (let id = 0; id < landed; id++) {
      const m = this.mode[id];
      if (m === MODE_DRAGGED) {
        anyMessy = true;
      } else if (m === MODE_LOOSE) {
        anyMessy = true;
        looseIds.push(id);
      } else if (m === MODE_RETURNING) {
        anyReturning = true;
        if (this.returnDelay[id] > 0) {
          this.returnDelay[id] = Math.max(0, this.returnDelay[id] - dt);
          continue;
        }
        const tx = this.homeX(id);
        const ty = this.homeY(id);
        const k = 1 - Math.pow(0.76, dt / 16);
        this.px[id] += (tx - this.px[id]) * k;
        this.py[id] += (ty - this.py[id]) * k;
        this.rot[id] *= Math.pow(0.74, dt / 16);
        if (Math.hypot(tx - this.px[id], ty - this.py[id]) < 0.8 * this.dpr) {
          this.px[id] = tx;
          this.py[id] = ty;
          this.rot[id] = 0;
          this.vx[id] = 0;
          this.vy[id] = 0;
          this.vrot[id] = 0;
          this.mode[id] = MODE_STACKED;
        }
      }
    }

    // Ordenar las sueltas por profundidad en su torre libre (0 = mesa, 1 = sobre otra, ...).
    if (looseIds.length > 1) {
      looseIds.sort((a, b) => this.looseDepth(a) - this.looseDepth(b));
    }

    for (let idx = 0; idx < looseIds.length; idx++) {
      const id = looseIds[idx];
      let p = this.parent[id];
      if (p >= 0 && this.mode[p] !== MODE_LOOSE) {
        this.parent[id] = -1;
        this.stackOffX[id] = 0;
        p = -1;
      }

      if (p >= 0) {
        // Moneda suelta apilada sobre otra moneda suelta `p` (torre creada por el usuario).
        const root = this.looseRoot(p);
        this.floorY[id] = this.floorY[root];
        const restX = this.px[p] + this.stackOffX[id];
        const restY = this.py[p] - this.thick;

        if (this.py[id] < restY - 0.5 || this.vy[id] !== 0) {
          this.vy[id] += g * dt;
          this.py[id] += this.vy[id] * dt;
          if (this.py[id] >= restY) {
            const impact = this.vy[id];
            this.py[id] = restY;
            if (impact > 0.16 * this.dpr) {
              this.vy[id] = -impact * 0.2;
              this.emitClink(this.geom[id].extra, Math.min(0.85, impact / (0.85 * this.dpr)));
            } else {
              this.vy[id] = 0;
            }
          }
        } else {
          this.py[id] = restY;
        }

        // Acompañar suavemente a la moneda inferior y amortiguar cualquier golpe horizontal.
        const followK = this.py[id] < restY - this.thick ? 0.22 : 0.45;
        this.px[id] += (restX - this.px[id]) * followK + this.vx[id] * dt;
        this.vx[id] *= stackFriction;
        if (Math.abs(this.vx[id]) < 0.004) this.vx[id] = 0;

        // Si se desplaza demasiado respecto a `p`, pierde el equilibrio y cae a la mesa.
        const overhang = this.px[id] - this.px[p];
        if (Math.abs(overhang) > this.rx * 0.56 && this.py[id] >= restY - this.thick) {
          const tipVx = Math.max(-0.24 * this.dpr, Math.min(0.24 * this.dpr, this.vx[id])) + Math.sign(overhang) * 0.09 * this.dpr;
          this.releaseToLoose(id, tipVx, 0, Math.sign(overhang) * 0.0025, this.floorY[root]);
          continue;
        }

        this.rot[id] *= Math.pow(0.72, dt / 16);
        this.vrot[id] *= Math.pow(0.72, dt / 16);
        if (Math.abs(this.rot[id]) < 0.002) {
          this.rot[id] = 0;
          this.vrot[id] = 0;
        }
        continue;
      }

      // Moneda suelta apoyada directamente en la mesa (raíz).
      const fy = this.floorY[id];
      const onFloor = this.py[id] >= fy - 0.5 && Math.abs(this.vy[id]) < 0.04 * this.dpr;
      if (!onFloor) {
        this.vy[id] += g * dt;
        this.py[id] += this.vy[id] * dt;
        if (this.py[id] >= fy) {
          const impact = this.vy[id];
          this.py[id] = fy;
          if (impact > 0.16 * this.dpr) {
            this.vy[id] = -impact * 0.22;
            this.vx[id] *= 0.78;
            this.vx[id] += (Math.random() - 0.5) * impact * 0.05;
            this.vrot[id] = (Math.random() - 0.5) * 0.003;
            this.emitClink(this.geom[id].extra, Math.min(1, impact / (0.85 * this.dpr)));
          } else {
            this.vy[id] = 0;
          }
        }
      } else {
        this.py[id] = fy;
        this.vy[id] = 0;
        this.vx[id] *= tableFriction;
        if (Math.abs(this.vx[id]) < 0.005) this.vx[id] = 0;
      }

      this.px[id] += this.vx[id] * dt;
      if (this.px[id] < marginX) {
        this.px[id] = marginX;
        this.vx[id] = Math.abs(this.vx[id]) * 0.45;
        if (Math.abs(this.vx[id]) > 0.15 * this.dpr) this.emitClink(this.geom[id].extra, 0.35);
      } else if (this.px[id] > W - marginX) {
        this.px[id] = W - marginX;
        this.vx[id] = -Math.abs(this.vx[id]) * 0.45;
        if (Math.abs(this.vx[id]) > 0.15 * this.dpr) this.emitClink(this.geom[id].extra, 0.35);
      }
      if (this.py[id] < this.topLimitY) {
        this.py[id] = this.topLimitY;
        this.vy[id] = Math.abs(this.vy[id]) * 0.3;
      }

      if (onFloor) {
        this.rot[id] *= Math.pow(0.72, dt / 16);
        this.vrot[id] *= Math.pow(0.72, dt / 16);
        if (Math.abs(this.rot[id]) < 0.002) {
          this.rot[id] = 0;
          this.vrot[id] = 0;
        }
      } else {
        this.vrot[id] *= Math.pow(0.95, dt / 16);
        this.rot[id] = Math.max(-0.55, Math.min(0.55, this.rot[id] + this.vrot[id] * dt));
      }
    }

    this.reportMessy(anyMessy && !anyReturning);
  }

  /** Hit-testing exacto de delante hacia atrás (inverso al último orden de pintado), solo monedas cobradas. */
  pick(cssX: number, cssY: number): number {
    const x = cssX * this.dpr;
    const y = cssY * this.dpr;
    const { rx, ry, thick } = this;

    // Recorrer del último dibujado (más al frente / arriba) al primero.
    for (let i = this.drawOrder.length - 1; i >= 0; i--) {
      const id = this.drawOrder[i];
      if (id >= this.prevLanded) continue;
      const cx = this.px[id];
      const topY = this.py[id];
      const nx = (x - cx) / (rx * 1.06);
      const nyTop = (y - topY) / (ry * 1.15);
      if (nx * nx + nyTop * nyTop <= 1) return id;
      if (Math.abs(x - cx) <= rx * 1.04 && y >= topY && y <= topY + thick + ry * 0.95) {
        const nyBot = (y - (topY + thick)) / (ry * 1.1);
        if (y <= topY + thick || nx * nx + nyBot * nyBot <= 1) return id;
      }
    }
    return -1;
  }

  /** Pre-renderiza un sprite fotorrealista de moneda cilíndrica 3D sólida con canto estriado. */
  private getCoinSprite(palKey: string, pal: MetalPalette): HTMLCanvasElement {
    const key = `coin|${palKey}`;
    const cached = this.spriteCache.get(key);
    if (cached) return cached;

    const { rx, ry, thick } = this;
    const pad = Math.ceil(2 * this.dpr);
    const w = Math.ceil(rx * 2) + pad * 2;
    const h = Math.ceil(ry * 2 + thick) + pad * 2;
    const cx = w / 2;
    const topY = pad + ry;
    const botY = topY + thick;

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;

    // 1. Cuerpo cilíndrico (canto metálico vertical con reflejo especular).
    const edgeGrad = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
    edgeGrad.addColorStop(0, pal.rimDark);
    edgeGrad.addColorStop(0.14, pal.rimMid);
    edgeGrad.addColorStop(0.26, pal.rimSpec);
    edgeGrad.addColorStop(0.4, pal.rimBright);
    edgeGrad.addColorStop(0.62, pal.rimMid);
    edgeGrad.addColorStop(0.76, pal.rimDark);
    edgeGrad.addColorStop(0.89, pal.rimBright);
    edgeGrad.addColorStop(1, pal.rimDark);

    g.beginPath();
    g.ellipse(cx, botY, rx, ry, 0, 0, Math.PI);
    g.lineTo(cx - rx, topY);
    g.ellipse(cx, topY, rx, ry, 0, Math.PI, 0, true);
    g.closePath();
    g.fillStyle = edgeGrad;
    g.fill();

    // 2. Estrías verticales del canto con acortamiento en perspectiva (cos θ).
    g.save();
    g.clip();
    g.strokeStyle = pal.groove;
    g.lineWidth = Math.max(0.7, 0.85 * this.dpr);
    const reeds = Math.max(18, Math.round(rx / (1.8 * this.dpr)));
    for (let k = 1; k < reeds; k++) {
      const th = (k / reeds) * Math.PI;
      const gx = cx - Math.cos(th) * rx;
      g.beginPath();
      g.moveTo(gx, topY);
      g.lineTo(gx, botY + ry);
      g.stroke();
    }
    // Filo inferior oscuro para separar limpiamente monedas apiladas.
    g.strokeStyle = 'rgba(28, 14, 2, 0.58)';
    g.lineWidth = Math.max(1, 1.15 * this.dpr);
    g.beginPath();
    g.ellipse(cx, botY, rx, ry, 0, 0.03, Math.PI - 0.03);
    g.stroke();
    g.restore();

    // 3. Cara superior sólida (siempre dibujada para que nunca parezcan huecas al moverse o caer).
    const bevelGrad = g.createLinearGradient(cx - rx, topY - ry, cx + rx, topY + ry);
    bevelGrad.addColorStop(0, pal.rimSpec);
    bevelGrad.addColorStop(0.32, pal.faceLight);
    bevelGrad.addColorStop(0.68, pal.rimMid);
    bevelGrad.addColorStop(1, pal.faceDark);
    g.beginPath();
    g.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = bevelGrad;
    g.fill();

    // Cara interior rebajada con brillo metálico diagonal.
    const inRx = rx * 0.87;
    const inRy = ry * 0.83;
    const faceGrad = g.createLinearGradient(cx - inRx, topY - inRy, cx + inRx, topY + inRy);
    faceGrad.addColorStop(0, pal.faceDark);
    faceGrad.addColorStop(0.28, pal.faceMid);
    faceGrad.addColorStop(0.5, pal.faceLight);
    faceGrad.addColorStop(0.68, pal.faceMid);
    faceGrad.addColorStop(1, pal.faceDark);
    g.beginPath();
    g.ellipse(cx, topY + ry * 0.03, inRx, inRy, 0, 0, Math.PI * 2);
    g.fillStyle = faceGrad;
    g.fill();

    // Sombra interior del reborde acuñado (arriba) + destello inferior.
    g.strokeStyle = 'rgba(72, 38, 4, 0.35)';
    g.lineWidth = Math.max(0.9, 1.05 * this.dpr);
    g.beginPath();
    g.ellipse(cx, topY + ry * 0.03, inRx, inRy, 0, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();

    g.strokeStyle = 'rgba(255, 252, 224, 0.5)';
    g.lineWidth = Math.max(0.8, 0.9 * this.dpr);
    g.beginPath();
    g.ellipse(cx, topY + ry * 0.03, inRx, inRy, 0, 0.08, Math.PI - 0.08);
    g.stroke();

    // 4. Filo brillante superior del bisel delantero.
    g.strokeStyle = pal.rimSpec;
    g.globalAlpha = 0.58;
    g.lineWidth = Math.max(0.8, 0.9 * this.dpr);
    g.beginPath();
    g.ellipse(cx, topY, rx - 0.5, ry - 0.25, 0, 0.14, Math.PI - 0.14);
    g.stroke();
    g.globalAlpha = 1;

    this.spriteCache.set(key, c);
    return c;
  }

  private drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, shRx: number, shRy: number, alpha: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, shRy / shRx);
    const sg = ctx.createRadialGradient(0, 0, shRx * 0.18, 0, 0, shRx);
    sg.addColorStop(0, this.isLight ? `rgba(55, 36, 12, ${alpha * 0.45})` : `rgba(0, 0, 0, ${alpha})`);
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, shRx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  draw(f: AltFrame): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const dt = this.lastTime > 0 ? Math.min(34, f.time - this.lastTime) : 16;
    this.lastTime = f.time;
    if (!f.reducedMotion) this.stepPhysics(dt, f.landed);

    const { rx, ry, thick } = this;
    const focusId = f.selected >= 0 ? f.selected : f.hovered;
    const milestoneSet = new Set(f.milestoneIds);

    // 1. Halo ambiental cálido dorado detrás de las monedas.
    const centerX = W / 2;
    const centerY = H * 0.52;
    const haloR = Math.max(W, H) * 0.42;
    const halo = ctx.createRadialGradient(centerX, centerY, rx * 0.5, centerX, centerY, haloR);
    halo.addColorStop(0, this.isLight ? 'rgba(235, 182, 74, 0.2)' : 'rgba(240, 192, 92, 0.12)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // 2. Sombras bajo las pilas que tienen al menos una moneda apilada (sin fantasmas).
    for (const st of this.stacks) {
      let hasStacked = false;
      for (let r = 0; r < st.ids.length; r++) {
        const cid = st.ids[r];
        if (cid >= f.landed) break;
        if (this.mode[cid] === MODE_STACKED) {
          hasStacked = true;
          break;
        }
      }
      if (!hasStacked) continue;
      this.drawShadow(ctx, st.bx, st.by + ry * 0.35, rx * 1.3, ry * 1.5, 0.64);
    }

    // Sombras de contacto para monedas sueltas raíz o arrastradas (se encogen y suavizan con la altura).
    for (let id = 0; id < f.landed; id++) {
      const m = this.mode[id];
      if (m !== MODE_LOOSE && m !== MODE_DRAGGED) continue;
      if (m === MODE_LOOSE && this.parent[id] >= 0) continue; // La sombra la dibuja la moneda base de la torre libre.
      const fy = m === MODE_DRAGGED ? Math.max(this.tableTopY, Math.min(this.tableBotY, this.py[id] + ry * 2.5)) : this.floorY[id];
      const height = Math.max(0, fy - this.py[id]);
      const hScale = Math.max(0.55, 1 - height / (rx * 6));
      const baseAlpha = m === MODE_LOOSE && this.looseChildOf(id) >= 0 ? 0.62 : 0.55;
      const alpha = Math.max(0.16, baseAlpha * hScale);
      this.drawShadow(ctx, this.px[id], fy + thick + ry * 0.25, rx * (1.16 * (2 - hScale * 0.85)), ry * 1.25, alpha);
    }

    // 3. Construir orden de pintado 3D real (plano de profundidad → altura → monedas agarradas siempre encima).
    const order: number[] = [];
    for (let id = 0; id < f.landed; id++) order.push(id);
    order.sort((a, b) => {
      const ma = this.mode[a];
      const mb = this.mode[b];
      const da = ma === MODE_DRAGGED ? 1e9 : ma === MODE_LOOSE ? this.floorY[a] : this.stacks[this.geom[a].stackIdx].by;
      const db = mb === MODE_DRAGGED ? 1e9 : mb === MODE_LOOSE ? this.floorY[b] : this.stacks[this.geom[b].stackIdx].by;
      if (Math.abs(da - db) > 0.5) return da - db;
      // En el mismo plano: las más bajas (mayor py) primero, las más altas (menor py) encima.
      if (Math.abs(this.py[b] - this.py[a]) > 0.25) return this.py[b] - this.py[a];
      return a - b;
    });
    this.drawOrder = order;

    // 4. Dibujar solo las monedas cobradas (sin siluetas fantasma).
    const pad = Math.ceil(2 * this.dpr);
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const g = this.geom[id];
      const cut = f.cutoff >= 0 && id >= f.cutoff;
      const dimLayer = f.layersOn && f.highlightYear >= 0 && g.year !== f.highlightYear;
      const isFocus = id === focusId && this.mode[id] !== MODE_DRAGGED;

      const popX = isFocus && this.mode[id] === MODE_STACKED ? rx * 0.12 : 0;
      const popY = isFocus ? -thick * 0.45 : 0;
      const cx = this.px[id] + popX;
      const topY = this.py[id] + popY;
      const rot = this.rot[id];

      let pal = g.extra ? EXTRA_PALETTE : GOLD_PALETTE;
      let palKey = g.extra ? 'extra' : 'gold';
      if (f.layersOn) {
        const idx = g.year % LAYER_METALS.length;
        pal = LAYER_METALS[idx];
        palKey = `L${idx}${g.extra ? 'e' : ''}`;
      }
      const sprite = this.getCoinSprite(palKey, pal);

      ctx.save();
      if (cut) ctx.globalAlpha = 0.18;
      else if (dimLayer) ctx.globalAlpha = 0.25;

      if (rot !== 0) {
        ctx.translate(cx, topY);
        ctx.rotate(rot);
        ctx.drawImage(sprite, -sprite.width / 2, -(pad + ry));
      } else {
        ctx.drawImage(sprite, Math.round(cx - sprite.width / 2), Math.round(topY - (pad + ry)));
      }

      if (isFocus) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.isLight ? '#9c6212' : '#fff5b8';
        ctx.lineWidth = Math.max(1.5, 1.8 * this.dpr);
        ctx.beginPath();
        ctx.ellipse(cx, topY, rx + 1.5 * this.dpr, ry + 1 * this.dpr, rot, 0, Math.PI * 2);
        ctx.stroke();
      } else if (id === this.snapPreviewId) {
        // Destello dorado sutil para indicar que al soltar se apilará sobre esta moneda.
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = this.isLight ? '#b57410' : '#ffe88a';
        ctx.lineWidth = Math.max(1.8, 2.2 * this.dpr);
        ctx.setLineDash([4 * this.dpr, 3 * this.dpr]);
        ctx.beginPath();
        ctx.ellipse(cx, topY - thick * 0.4, rx * 1.04, ry * 1.06, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (milestoneSet.has(id) && !cut) {
        const pulse = f.reducedMotion ? 0.85 : 0.45 + 0.55 * Math.sin(f.time / 480 + id);
        const sx = cx + rx * 0.62;
        const sy = topY - ry * 0.2;
        const gr = 10 * this.dpr;
        const mg = ctx.createRadialGradient(sx, sy, 0, sx, sy, gr);
        mg.addColorStop(0, `rgba(255, 245, 190, ${pulse})`);
        mg.addColorStop(1, 'rgba(255, 210, 110, 0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(sx, sy, gr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Instantánea para la tarjeta de compartir. */
  snapshot(width: number, height: number, frame: AltFrame): { canvas: HTMLCanvasElement } {
    const canvas = document.createElement('canvas');
    const view = new CoinsView(canvas, this.grains, frame.landed);
    view.resize(width, height, 1);
    view.draw({ ...frame, selected: -1, hovered: -1 });
    return { canvas };
  }
}
