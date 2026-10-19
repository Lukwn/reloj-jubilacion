import { isInterior, profileHalf, type Hourglass } from './hourglass';
import { EMPTY, WALL, type GrainSim } from './sim';

/** Radio de una canica, en celdas: dos canicas que se tocan están a una celda. */
const R = 0.5;
/** Holgura del vidrio respecto a las celdas, la misma con la que se dibuja. */
const PAD = 0.6;
/** Tramos del perfil del vidrio por celda: el mismo contorno suave que se dibuja. */
const RES = 6;
/** Gravedad, en celdas por paso². Con dos pasos por fotograma, una caída de 10 celdas tarda unos 0,7 s. */
const GRAVITY = 0.01;
/** Velocidad máxima por paso: menos de media canica, para que nunca se atraviesen. */
const MAX_SPEED = 0.3;
/**
 * Parte de la corrección de un solapamiento que NO se convierte en velocidad. Sin esto, separar
 * dos canicas que se pisan (al posarse una o al apartarlas con el dedo) las lanza como muelles.
 */
const INELASTIC = 0.6;
/**
 * Pasos seguidos quieta para dormirse. Una canica dormida no se calcula (ni la gravedad la hunde
 * poco a poco) hasta que algo la despierta: si no, los montones acaban cediendo de golpe en
 * pequeños aludes espontáneos.
 */
const SLEEP_STEPS = 60;
/**
 * Una canica cuenta como quieta mientras no se aleje más que esto del sitio donde empezó a
 * estarlo. Así también se duermen las que solo vibran en su hueco (en el embudo, apretadas entre
 * el vidrio y sus vecinas), que si no temblarían para siempre.
 */
const REST_RADIUS = 0.06;
/** Un solapamiento mayor que este con una canica despierta despierta a la dormida. */
const WAKE_OVERLAP = 0.04;
/**
 * Cada paso se divide en subpasos, con pocas rondas de choques en cada uno. Es mucho más estable
 * que muchas rondas en un solo paso: ahí las correcciones se convierten en velocidad y las
 * canicas no paran de rebotar.
 */
const SUBSTEPS = 8;
const ITERATIONS = 2;
/** Amortiguación por subpaso (≈ 0,985 por paso). */
const DAMPING = Math.pow(0.985, 1 / SUBSTEPS);
/** Por debajo de esta velocidad la canica se para (rozamiento estático: los montones no se derriten). */
const REST_SPEED = 0.0012;
/** Separación vertical entre filas a tresbolillo: √3 · R. */
const ROW = Math.sqrt(3) * R;

/**
 * Canicas con física de verdad, para las unidades con pocos granos (nóminas, años): cada una
 * con su posición y su velocidad (integración de Verlet), choques entre canicas y contra el
 * mismo contorno curvo que se dibuja como vidrio. El cuello está cerrado: solo lo cruza la
 * canica que cae, fuera de la simulación.
 *
 * Para el resto de la app se comporta como `SandSim`: mantiene una rejilla con el id+1 de cada
 * canica en la celda de su centro, que se recalcula en cada paso.
 */
export class MarbleSim implements GrainSim {
  readonly W: number;
  readonly H: number;
  readonly grid: Int32Array;
  readonly pos: Int32Array;
  /** Centro de cada canica y su posición en el paso anterior (la velocidad es la diferencia). */
  readonly x: Float32Array;
  readonly y: Float32Array;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  /** Posiciones al empezar el paso, para medir cuánto se ha movido cada canica. */
  private readonly sx: Float32Array;
  private readonly sy: Float32Array;
  /** 1 = bulbo de arriba, 2 = de abajo, 0 = fuera del reloj (cayendo por el cuello). */
  readonly bulb: Uint8Array;
  /**
   * Radio de cada canica: entre un 90 % y el 100 % de R. Iguales del todo encajarían en una red
   * perfecta de triángulos, estable incluso sin rozamiento, y se apilarían en picos y torres.
   * Va con la canica física: al intercambiar identidades (swapCells) se intercambia también.
   */
  readonly rad: Float32Array;
  /** Canicas que ya están en su hueco mientras se ordena: no se mueven hasta terminar. */
  private readonly pinned: Uint8Array;
  /** Pasos seguidos que lleva quieta cada canica (dormida a partir de SLEEP_STEPS). */
  private readonly rest: Uint8Array;
  /** Sitio donde cada canica empezó a estar quieta. */
  private readonly ax: Float32Array;
  private readonly ay: Float32Array;
  private lastAngle = 0;

  agitation = 0;
  tilt = 0;
  gravityAngle = 0;
  activeCount = 0;

  private readonly base: Int32Array;
  /** Semiancho del vidrio cada 1/RES celdas de altura (H·RES + 1 valores). */
  private readonly edge: Float32Array;
  /** Celda interior más cercana a cada celda, para la rejilla de compatibilidad. */
  private readonly nearestInterior: Int32Array;
  private readonly cx: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;
  private seed: number;
  private neckId = -1;
  private landFlip = 0;

  private sortIds: Int32Array[] = [];
  private sortTargets: Float32Array[] = [];
  private sortAt: number[] = [];

  constructor(
    readonly hg: Hourglass,
    readonly grainCount: number,
    seed = 0x2545f491,
  ) {
    const { W, H } = hg;
    this.W = W;
    this.H = H;
    this.cx = W / 2;
    this.base = new Int32Array(W * H).fill(WALL);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isInterior(hg, x, y)) this.base[y * W + x] = EMPTY;
    this.grid = Int32Array.from(this.base);
    this.pos = new Int32Array(grainCount).fill(-1);
    this.x = new Float32Array(grainCount);
    this.y = new Float32Array(grainCount);
    this.px = new Float32Array(grainCount);
    this.py = new Float32Array(grainCount);
    this.sx = new Float32Array(grainCount);
    this.sy = new Float32Array(grainCount);
    this.bulb = new Uint8Array(grainCount);
    this.rad = new Float32Array(grainCount);
    for (let i = 0; i < grainCount; i++) {
      // Siempre el mismo tamaño para la misma canica (no depende del orden de la simulación).
      const h = Math.imul(i + 1, 0x9e3779b1) >>> 0;
      this.rad[i] = R * (0.9 + 0.1 * ((h >>> 8) / 16777216));
    }
    this.pinned = new Uint8Array(grainCount);
    this.rest = new Uint8Array(grainCount);
    this.ax = new Float32Array(grainCount);
    this.ay = new Float32Array(grainCount);
    this.edge = new Float32Array(H * RES + 1);
    for (let k = 0; k <= H * RES; k++) this.edge[k] = profileHalf(hg, k / RES) + PAD;
    this.nearestInterior = new Int32Array(W * H);
    for (let i = 0; i < W * H; i++) this.nearestInterior[i] = this.findInterior(i);
    this.head = new Int32Array(W * H);
    this.next = new Int32Array(grainCount);
    this.seed = seed | 0 || 1;
  }

  get fallAngle(): number {
    return this.gravityAngle + this.tilt * 0.6;
  }

  get pendingActive(): number {
    return this.activeCount;
  }

  rand(): number {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x;
    return (x >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------- geometría

  /** Hasta dónde puede llegar el centro de una canica a cada lado, a la altura `y`. */
  private reach(y: number): number {
    const f = Math.max(0, Math.min(this.H, y)) * RES;
    const i = Math.min(this.H * RES - 1, Math.floor(f));
    const t = f - i;
    return this.edge[i] * (1 - t) + this.edge[i + 1] * t - R;
  }

  /**
   * Límites verticales del centro en cada bulbo. El cuello mide justo una canica: la siguiente
   * en caer se mete en él y hace de tapón. Las de abajo, con el reloj boca abajo, se quedan en
   * la boca del cuello sin entrar, para no pisar al tapón.
   */
  private yMin(b: number): number {
    return b === 1 ? R : this.hg.bottomStart + R;
  }
  private yMax(b: number): number {
    return b === 1 ? this.hg.topEnd + R : this.H - R;
  }

  private findInterior(i: number): number {
    if (this.base[i] === EMPTY) return i;
    const { W, H } = this;
    const x0 = i % W;
    const y0 = Math.floor(i / W);
    for (let r = 1; r < Math.max(W, H); r++) {
      let best = -1;
      let bestD = Infinity;
      for (let y = y0 - r; y <= y0 + r; y++) {
        for (let x = x0 - r; x <= x0 + r; x++) {
          if (x < 0 || x >= W || y < 0 || y >= H || this.base[y * W + x] !== EMPTY) continue;
          const d = (x - x0) ** 2 + (y - y0) ** 2;
          if (d < bestD) {
            bestD = d;
            best = y * W + x;
          }
        }
      }
      if (best >= 0) return best;
    }
    return i;
  }

  /**
   * Huecos a tresbolillo de un bulbo, de abajo arriba y desde el centro, como quedan unas canicas
   * echadas en un frasco. En el bulbo de arriba, «abajo» es junto al cuello.
   */
  layout(b: 1 | 2, n: number): Float32Array {
    const out = new Float32Array(n * 2);
    let k = 0;
    const lo = this.yMin(b);
    for (let row = 0, y = this.yMax(b); k < n && y >= lo - 1e-6; row++, y -= ROW) {
      const a = this.reach(y) - 0.02;
      if (a < 0) continue;
      const off = row % 2 === 0 ? 0 : R;
      // Huecos de la fila, del centro hacia fuera.
      const xs: number[] = [];
      for (let j = -Math.ceil(a) - 1; j <= Math.ceil(a) + 1; j++) {
        const x = this.cx + off + j * 2 * R;
        if (Math.abs(x - this.cx) <= a) xs.push(x);
      }
      xs.sort((p, q) => Math.abs(p - this.cx) - Math.abs(q - this.cx) || p - q);
      for (const x of xs) {
        if (k >= n) break;
        out[2 * k] = x;
        out[2 * k + 1] = y;
        k++;
      }
    }
    // Si no cupieran (no debería: el reloj se dimensiona con holgura), se apilan arriba.
    for (; k < n; k++) {
      out[2 * k] = this.cx;
      out[2 * k + 1] = lo;
    }
    return out;
  }

  // ---------------------------------------------------------------- estado

  /** Fija (ordenándose) o dormida: no se mueve sola. */
  private held(i: number): boolean {
    return this.pinned[i] === 1 || this.rest[i] >= SLEEP_STEPS;
  }

  /** Despierta las canicas a menos de `r` de un punto. */
  private wakeNear(x: number, y: number, r: number): void {
    for (let i = 0; i < this.grainCount; i++) {
      if (this.bulb[i] && (this.x[i] - x) ** 2 + (this.y[i] - y) ** 2 < r * r) this.rest[i] = 0;
    }
  }

  private place(id: number, x: number, y: number, b: number): void {
    this.rest[id] = 0;
    this.x[id] = this.px[id] = x;
    this.y[id] = this.py[id] = y;
    this.bulb[id] = b;
  }

  /** 0..fallen-1 en el bulbo de abajo (el más antiguo al fondo) y el resto arriba (el siguiente, junto al cuello). */
  pack(fallen: number): void {
    const below = this.layout(2, fallen);
    for (let id = 0; id < fallen; id++) this.place(id, below[2 * id], below[2 * id + 1], 2);
    const above = this.layout(1, this.grainCount - fallen);
    for (let id = fallen; id < this.grainCount; id++) {
      const k = id - fallen;
      this.place(id, above[2 * k], above[2 * k + 1], 1);
    }
    // Un momento para que cada canica se acomode contra el vidrio.
    for (let i = 0; i < 60; i++) this.step();
    this.activeCount = 0;
    // Al acomodarse pueden cambiar de orden junto al cuello: la que queda en él es la siguiente.
    if (fallen < this.grainCount) {
      const neck = this.findNeckGrain();
      const next = this.pos[fallen];
      if (neck >= 0 && next >= 0 && neck !== next) this.swapCells(neck, next);
    }
  }

  put(id: number, idx: number): void {
    // Un pequeño desvío al azar: una canica que cae justo encima de otra no se queda en equilibrio
    // sobre ella, rueda por el montón (si no, se apilarían en columna).
    const x = (idx % this.W) + 0.5 + (this.rand() - 0.5) * 0.4;
    let y = Math.floor(idx / this.W) + 0.5;
    const b = y >= this.hg.bottomStart ? 2 : 1;
    // Se posa encima de lo que haya debajo, sin solaparse: si se metiera en el sitio de otra, al
    // separarse la apartaría y cada llegada excavaría el montón en vez de crecerlo.
    const up = Math.cos(this.fallAngle) >= 0 ? -1 : 1;
    for (let k = 0; k < 40 && this.overlapsAt(x, y, b); k++) y += up * 0.1;
    this.place(id, x, y, b);
    // Llega cayendo: con algo de velocidad (y un poco de lado), así rebota y rueda por el montón.
    const vy = -up * 0.12;
    const vx = (this.rand() - 0.5) * 0.08;
    this.px[id] = x - vx / SUBSTEPS;
    this.py[id] = y - vy / SUBSTEPS;
    this.grid[idx] = id + 1;
    this.pos[id] = idx;
    this.wakeNear(x, y, 2.5);
  }

  /** Hay alguna canica del bulbo `b` pisando el punto (x, y)? */
  private overlapsAt(x: number, y: number, b: number): boolean {
    for (let i = 0; i < this.grainCount; i++) {
      if (this.bulb[i] === b && (this.x[i] - x) ** 2 + (this.y[i] - y) ** 2 < 0.97 * 0.97) return true;
    }
    return false;
  }

  take(id: number): void {
    // Al salir una por el cuello, se despierta todo su bulbo: en un reloj de verdad baja todo el
    // montón, no solo las de encima del hueco.
    const b = this.bulb[id];
    if (b) for (let i = 0; i < this.grainCount; i++) if (this.bulb[i] === b) this.rest[i] = 0;
    const p = this.pos[id];
    if (p >= 0 && this.grid[p] === id + 1) this.grid[p] = this.base[p] === WALL ? WALL : EMPTY;
    this.pos[id] = -1;
    this.bulb[id] = 0;
  }

  /** Intercambia la identidad de las canicas de dos celdas: cada una se queda con el sitio de la otra. */
  swapCells(a: number, b: number): void {
    const ia = this.grid[a] - 1;
    const ib = this.grid[b] - 1;
    if (ia < 0 || ib < 0 || ia === ib) return;
    for (const arr of [this.x, this.y, this.px, this.py, this.rad]) {
      const t = arr[ia];
      arr[ia] = arr[ib];
      arr[ib] = t;
    }
    const tb = this.bulb[ia];
    this.bulb[ia] = this.bulb[ib];
    this.bulb[ib] = tb;
    if (this.neckId === ia) this.neckId = ib;
    else if (this.neckId === ib) this.neckId = ia;
    this.grid[a] = ib + 1;
    this.grid[b] = ia + 1;
    this.pos[ia] = b;
    this.pos[ib] = a;
  }

  wakeAll(): void {
    this.rest.fill(0);
  }

  pointOf(id: number): { x: number; y: number } | null {
    return this.bulb[id] ? { x: this.x[id], y: this.y[id] } : null;
  }

  nearest(x: number, y: number, reach: number): number {
    let best = -1;
    let bestD = (reach + R) ** 2;
    for (let id = 0; id < this.grainCount; id++) {
      if (!this.bulb[id]) continue;
      const d = (this.x[id] - x) ** 2 + (this.y[id] - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  /**
   * La canica del bulbo de arriba que está más cerca del cuello. Se conserva la de la vez anterior
   * mientras siga prácticamente igual de cerca, para que no salte de una a otra por un temblor.
   */
  findNeckGrain(): number {
    let best = -1;
    let bestScore = -Infinity;
    for (let id = 0; id < this.grainCount; id++) {
      if (this.bulb[id] !== 1) continue;
      const score = this.y[id] - Math.abs(this.x[id] - this.cx) * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    const kept = this.neckId;
    if (kept >= 0 && this.bulb[kept] === 1 && this.y[kept] - Math.abs(this.x[kept] - this.cx) * 0.25 > bestScore - 0.25) best = kept;
    this.neckId = best;
    return best >= 0 ? this.pos[best] : -1;
  }

  /** Celda libre donde se posa una canica que sale del cuello: encima del montón, bajo el cuello. */
  findLandingCell(side?: 0 | 1): number {
    const { W, H, bottomStart, centerOrder } = this.hg;
    const f = side ?? (this.landFlip ^= 1);
    const x = centerOrder[f];
    let y = bottomStart;
    if (this.grid[y * W + x] === EMPTY) {
      while (y + 1 < H && this.grid[(y + 1) * W + x] === EMPTY) y++;
      return y * W + x;
    }
    for (let yy = bottomStart; yy < H; yy++) {
      for (let i = 0; i < W; i++) {
        const idx = yy * W + centerOrder[i ^ f];
        if (this.grid[idx] === EMPTY) return idx;
      }
    }
    return -1;
  }

  countRows(y0: number, y1: number): number {
    let n = 0;
    for (let id = 0; id < this.grainCount; id++) if (this.bulb[id] && this.y[id] >= y0 && this.y[id] < y1) n++;
    return n;
  }

  // ---------------------------------------------------------------- física

  step(): void {
    const n = this.grainCount;
    const { x, y, px, py, bulb, sx, sy } = this;
    if (this.agitation > 0.01) this.agitate();

    const angle = this.fallAngle;
    // Si cambia la gravedad (inclinar, girar, agitar), todas despiertan.
    if (Math.abs(angle - this.lastAngle) > 0.003 || this.agitation > 0.01) this.wakeAll();
    this.lastAngle = angle;
    // Desplazamiento por la gravedad en cada subpaso (aceleración · dt², con dt = 1/SUBSTEPS).
    const gx = (Math.sin(angle) * GRAVITY) / (SUBSTEPS * SUBSTEPS);
    const gy = (Math.cos(angle) * GRAVITY) / (SUBSTEPS * SUBSTEPS);
    const maxV = MAX_SPEED / SUBSTEPS;
    sx.set(x);
    sy.set(y);

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      // Verlet: la velocidad es lo que se movió en el subpaso anterior.
      for (let i = 0; i < n; i++) {
        if (!bulb[i] || this.held(i)) continue;
        let vx = (x[i] - px[i]) * DAMPING;
        let vy = (y[i] - py[i]) * DAMPING;
        const v = Math.hypot(vx, vy);
        if (v > maxV) {
          vx *= maxV / v;
          vy *= maxV / v;
        }
        px[i] = x[i];
        py[i] = y[i];
        x[i] += vx + gx;
        y[i] += vy + gy;
      }
      this.bucket();
      for (let it = 0; it < ITERATIONS; it++) {
        this.collide();
        this.walls();
      }
    }

    // Rozamiento estático: lo que apenas se ha movido en todo el paso, se para; así los
    // montones se sostienen en vez de derretirse poco a poco.
    let active = 0;
    for (let i = 0; i < n; i++) {
      if (!bulb[i]) continue;
      if (Math.hypot(x[i] - sx[i], y[i] - sy[i]) < REST_SPEED) {
        px[i] = x[i];
        py[i] = y[i];
      } else active++;
      // Dormirse: lleva un rato sin alejarse de su sitio (aunque vibre un poco).
      if (this.held(i)) continue;
      if (this.rest[i] > 0 && (x[i] - this.ax[i]) ** 2 + (y[i] - this.ay[i]) ** 2 < REST_RADIUS * REST_RADIUS) {
        if (++this.rest[i] >= SLEEP_STEPS) {
          px[i] = x[i];
          py[i] = y[i];
        }
      } else {
        this.rest[i] = 1;
        this.ax[i] = x[i];
        this.ay[i] = y[i];
      }
    }
    this.activeCount = active;
    this.wakeMoved();
    this.rasterize();
  }

  /**
   * Las que se mueven despiertan a las que tienen alrededor, en cadena: cuando sale una por el
   * cuello, las de encima pierden su apoyo y tienen que bajar todas, no quedarse dormidas en el
   * aire ni bajar en columna.
   */
  private wakeMoved(): void {
    const { W, H, x, y, sx, sy, bulb, head, next } = this;
    this.bucket();
    for (let i = 0; i < this.grainCount; i++) {
      if (!bulb[i] || this.held(i)) continue;
      if ((x[i] - sx[i]) ** 2 + (y[i] - sy[i]) ** 2 < 0.01 * 0.01) continue;
      const cx = Math.floor(x[i]);
      const cy = Math.floor(y[i]);
      for (let yy = cy - 2; yy <= cy + 1; yy++) {
        if (yy < 0 || yy >= H) continue;
        for (let xx = cx - 2; xx <= cx + 2; xx++) {
          if (xx < 0 || xx >= W) continue;
          for (let j = head[yy * W + xx]; j >= 0; j = next[j]) {
            if (this.pinned[j] || this.rest[j] < SLEEP_STEPS) continue;
            if ((x[j] - x[i]) ** 2 + (y[j] - y[i]) ** 2 < 1.6 * 1.6) this.rest[j] = 0;
          }
        }
      }
    }
  }

  /** Reparte las canicas en listas por celda para buscar vecinas solo en las de alrededor. */
  private bucket(): void {
    const { W, H, x, y, bulb, head, next } = this;
    head.fill(-1);
    for (let i = 0; i < this.grainCount; i++) {
      if (!bulb[i]) continue;
      const cx = Math.min(W - 1, Math.max(0, Math.floor(x[i])));
      const cy = Math.min(H - 1, Math.max(0, Math.floor(y[i])));
      const c = cy * W + cx;
      next[i] = head[c];
      head[c] = i;
    }
  }

  /** Separa las canicas que se solapan, la mitad cada una. */
  private collide(): void {
    const { W, H, x, y, bulb, head, next } = this;
    const rad = this.rad;
    for (let i = 0; i < this.grainCount; i++) {
      if (!bulb[i]) continue;
      const cx = Math.floor(x[i]);
      const cy = Math.floor(y[i]);
      for (let yy = cy - 1; yy <= cy + 1; yy++) {
        if (yy < 0 || yy >= H) continue;
        for (let xx = cx - 1; xx <= cx + 1; xx++) {
          if (xx < 0 || xx >= W) continue;
          for (let j = head[yy * W + xx]; j >= 0; j = next[j]) {
            if (j <= i || bulb[j] !== bulb[i]) continue;
            let dx = x[j] - x[i];
            let dy = y[j] - y[i];
            let d2 = dx * dx + dy * dy;
            const D = rad[i] + rad[j];
            if (d2 >= D * D) continue;
            if (d2 < 1e-8) {
              // Dos canicas en el mismo punto: se separan en una dirección cualquiera.
              dx = this.rand() - 0.5;
              dy = this.rand() - 0.5;
              d2 = dx * dx + dy * dy;
            }
            let pi = this.held(i);
            let pj = this.held(j);
            if (pi && pj) continue;
            const d = Math.sqrt(d2);
            // Si una despierta se le mete bastante a una dormida, la despierta (salvo las fijas).
            if (D - d > WAKE_OVERLAP) {
              if (pi && !this.pinned[i]) {
                this.rest[i] = 0;
                pi = false;
              }
              if (pj && !this.pinned[j]) {
                this.rest[j] = 0;
                pj = false;
              }
            }
            // Contra una canica fija (ya ordenada), solo se aparta la otra.
            const push = (D - d) / ((pi || pj ? 1 : 2) * d);
            const { px, py } = this;
            if (!pi) {
              x[i] -= dx * push;
              y[i] -= dy * push;
              px[i] -= dx * push * INELASTIC;
              py[i] -= dy * push * INELASTIC;
            }
            if (!pj) {
              x[j] += dx * push;
              y[j] += dy * push;
              px[j] += dx * push * INELASTIC;
              py[j] += dy * push * INELASTIC;
            }
          }
        }
      }
    }
  }

  /**
   * Mantiene cada canica dentro de su bulbo, contra el vidrio curvo. El vidrio empuja en
   * perpendicular a su superficie (así sostiene a las canicas apoyadas en las paredes inclinadas)
   * y con rozamiento: si solo empujara en horizontal, resbalarían sin parar por el embudo.
   */
  private walls(): void {
    const { x, y, bulb, cx, edge } = this;
    for (let i = 0; i < this.grainCount; i++) {
      const b = bulb[i];
      if (!b || this.held(i)) continue;
      // Pared del lado en el que está: los tramos del perfil del vidrio alrededor de su altura.
      const side = x[i] >= cx ? 1 : -1;
      const k0 = Math.max(0, Math.floor((y[i] - 1) * RES));
      const k1 = Math.min(this.H * RES - 1, Math.ceil((y[i] + 1) * RES));
      for (let k = k0; k <= k1; k++) {
        const ax = cx + side * edge[k];
        const ay = k / RES;
        const bx = cx + side * edge[k + 1];
        const by = (k + 1) / RES;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy);
        // Normal hacia dentro del reloj.
        let nx = -dy / len;
        let ny = dx / len;
        if (nx * -side < 0) {
          nx = -nx;
          ny = -ny;
        }
        // Punto del tramo más cercano al centro de la canica.
        const t = Math.max(0, Math.min(1, ((x[i] - ax) * dx + (y[i] - ay) * dy) / (len * len)));
        const qx = ax + dx * t;
        const qy = ay + dy * t;
        const dist = (x[i] - qx) * nx + (y[i] - qy) * ny;
        const ri = this.rad[i];
        if (dist >= ri) continue;
        x[i] += nx * (ri - dist);
        y[i] += ny * (ri - dist);
        this.rub(i, nx, ny);
      }
      // Tapa y tapón del cuello, al final para que ningún tramo de vidrio los salte.
      const lo = this.yMin(b);
      const hi = this.yMax(b);
      if (y[i] < lo) {
        y[i] = lo;
        this.rub(i, 0, 1);
      } else if (y[i] > hi) {
        y[i] = hi;
        this.rub(i, 0, -1);
      }
      // Por si algún rincón se escapa: nunca más allá del perfil.
      const a = Math.max(0, this.reach(y[i]));
      if (x[i] - cx > a) x[i] = cx + a;
      else if (cx - x[i] > a) x[i] = cx - a;
    }
  }

  /** Choque contra el vidrio: se pierde la velocidad hacia él y parte de la que lleva a lo largo. */
  private rub(i: number, nx: number, ny: number): void {
    const vx = this.x[i] - this.px[i];
    const vy = this.y[i] - this.py[i];
    const vn = vx * nx + vy * ny;
    const tx = vx - vn * nx;
    const ty = vy - vn * ny;
    const keepN = vn > 0 ? vn : 0;
    this.px[i] = this.x[i] - (tx * 0.96 + keepN * nx);
    this.py[i] = this.y[i] - (ty * 0.96 + keepN * ny);
  }

  /**
   * Recalcula la rejilla: cada canica, en la celda de su centro (o la interior más cercana). Si
   * esa celda ya la tiene otra, en la libre más cercana: así cada celda es de una sola canica y
   * `grid[pos[id]] === id + 1` siempre, como en la arena.
   */
  private rasterize(): void {
    const { W, H, grid, pos } = this;
    grid.set(this.base);
    for (let i = 0; i < this.grainCount; i++) {
      if (!this.bulb[i]) {
        pos[i] = -1;
        continue;
      }
      const cx = Math.min(W - 1, Math.max(0, Math.floor(this.x[i])));
      const cy = Math.min(H - 1, Math.max(0, Math.floor(this.y[i])));
      let c = this.nearestInterior[cy * W + cx];
      if (grid[c] !== EMPTY) c = this.freeNear(c);
      grid[c] = i + 1;
      pos[i] = c;
    }
  }

  /** Celda interior libre más cercana a `c`. */
  private freeNear(c: number): number {
    const { W, H, grid } = this;
    const x0 = c % W;
    const y0 = Math.floor(c / W);
    for (let r = 1; r < Math.max(W, H); r++) {
      for (let y = y0 - r; y <= y0 + r; y++) {
        if (y < 0 || y >= H) continue;
        for (let x = x0 - r; x <= x0 + r; x++) {
          if (x < 0 || x >= W || (Math.abs(x - x0) !== r && Math.abs(y - y0) !== r)) continue;
          if (grid[y * W + x] === EMPTY) return y * W + x;
        }
      }
    }
    return c;
  }

  /** Agitar: empujones al azar contra la gravedad. */
  private agitate(): void {
    const a = Math.min(1, this.agitation);
    const angle = this.fallAngle;
    const ux = -Math.sin(angle);
    const uy = -Math.cos(angle);
    for (let i = 0; i < this.grainCount; i++) {
      if (!this.bulb[i] || this.rand() > a * 0.25) continue;
      const kick = this.rand() * a * 0.35;
      const side = (this.rand() - 0.5) * a * 0.3;
      // La velocidad es x - px: se cambia moviendo la posición anterior.
      this.px[i] -= (ux * kick + uy * side) / SUBSTEPS;
      this.py[i] -= (uy * kick - ux * side) / SUBSTEPS;
    }
  }

  /** Aparta las canicas de un círculo (el dedo) y las empuja en la dirección del arrastre. */
  dig(cx: number, cy: number, r: number, dx: number, dy: number): number {
    const dl = Math.hypot(dx, dy);
    const ux = dl > 0 ? dx / dl : 0;
    const uy = dl > 0 ? dy / dl : 0;
    let moved = 0;
    this.wakeNear(cx, cy, r + 3);
    for (let i = 0; i < this.grainCount; i++) {
      if (!this.bulb[i]) continue;
      let ox = this.x[i] - cx;
      let oy = this.y[i] - cy;
      const d = Math.hypot(ox, oy);
      if (d >= r + R) continue;
      if (d < 1e-6) {
        ox = -uy || 1;
        oy = ux;
      }
      const ol = Math.hypot(ox, oy);
      this.x[i] = cx + (ox / ol) * (r + R);
      this.y[i] = cy + (oy / ol) * (r + R);
      this.px[i] = this.x[i] - ((ox / ol) * 0.05 + ux * 0.05) / SUBSTEPS;
      this.py[i] = this.y[i] - ((oy / ol) * 0.05 + uy * 0.05) / SUBSTEPS;
      moved++;
    }
    return moved;
  }

  // ---------------------------------------------------------------- ordenar y nivelar

  get sorting(): boolean {
    return this.sortIds.some((ids, b) => this.sortAt[b] < ids.length);
  }

  /** Cada canica irá al hueco que le tocaría recién empaquetada: ordenadas por fecha y a nivel. */
  startSort(): void {
    this.sortIds = [];
    this.sortTargets = [];
    this.sortAt = [];
    for (const b of [1, 2] as const) {
      const ids: number[] = [];
      for (let id = 0; id < this.grainCount; id++) if (this.bulb[id] === b) ids.push(id);
      ids.sort((p, q) => p - q);
      this.sortIds.push(Int32Array.from(ids));
      this.sortTargets.push(this.layout(b, ids.length));
      this.sortAt.push(0);
    }
  }

  sortStep(fraction: number): boolean {
    for (let b = 0; b < this.sortIds.length; b++) {
      const ids = this.sortIds[b];
      const t = this.sortTargets[b];
      const end = Math.min(ids.length, this.sortAt[b] + Math.ceil(ids.length * fraction));
      for (let k = this.sortAt[b]; k < end; k++) {
        const id = ids[k];
        // Si mientras tanto ha cruzado el cuello, ya no es de este bulbo.
        if (this.bulb[id] !== b + 1) continue;
        this.place(id, t[2 * k], t[2 * k + 1], b + 1);
        this.pinned[id] = 1;
      }
      this.sortAt[b] = end;
    }
    if (this.sorting) return true;
    this.pinned.fill(0);
    this.wakeAll();
    return false;
  }

  stopSort(): void {
    this.sortIds = [];
    this.sortTargets = [];
    this.sortAt = [];
    this.pinned.fill(0);
  }
}
