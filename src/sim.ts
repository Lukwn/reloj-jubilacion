import { isInterior, type Hourglass } from './hourglass';

export const WALL = -1;
export const EMPTY = 0;

/**
 * Arena por autómata celular. Cada celda vale WALL, EMPTY o id+1 del grano que la ocupa,
 * así los granos conservan su identidad (y su fecha) aunque se muevan.
 * Solo se procesan los granos activos; los que llevan varios pasos quietos se duermen
 * y los despierta un vecino que se mueve.
 */
export class SandSim {
  readonly W: number;
  readonly H: number;
  readonly grid: Int32Array;
  /** Celda de cada grano, o -1 si no está en la rejilla (por ejemplo, cayendo por el cuello). */
  readonly pos: Int32Array;

  /** 0..1: intensidad de la agitación en curso. */
  agitation = 0;
  /** -1..1: inclinación lateral de la gravedad mientras se agita. */
  tilt = 0;
  /** Granos procesados en el último paso. */
  activeCount = 0;

  private cur: Int32Array;
  private nxt: Int32Array;
  private nxtCount = 0;
  private mark: Int32Array;
  private stamp = 1;
  private still: Uint8Array;
  private seed: number;

  constructor(
    readonly hg: Hourglass,
    readonly grainCount: number,
    seed = 0x9e3779b9,
  ) {
    this.W = hg.W;
    this.H = hg.H;
    this.grid = new Int32Array(hg.W * hg.H).fill(WALL);
    for (let y = 0; y < hg.H; y++) {
      for (let x = 0; x < hg.W; x++) if (isInterior(hg, x, y)) this.grid[y * hg.W + x] = EMPTY;
    }
    this.pos = new Int32Array(grainCount).fill(-1);
    this.cur = new Int32Array(grainCount);
    this.nxt = new Int32Array(grainCount);
    this.mark = new Int32Array(grainCount);
    this.still = new Uint8Array(grainCount);
    this.seed = seed | 0 || 1;
  }

  rand(): number {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x;
    return (x >>> 0) / 4294967296;
  }

  /**
   * Coloca los granos ya asentados: 0..fallen-1 en el bulbo inferior (los más antiguos abajo)
   * y fallen..N-1 en el superior (los más próximos junto al cuello).
   */
  pack(fallen: number): void {
    const { W, H, topEnd, bottomStart, centerOrder } = this.hg;
    const g = this.grid;
    let id = 0;
    for (let y = H - 1; y >= bottomStart && id < fallen; y--) {
      for (let i = 0; i < W && id < fallen; i++) {
        const idx = y * W + centerOrder[i];
        if (g[idx] === EMPTY) this.put(id++, idx, false);
      }
    }
    id = fallen;
    for (let y = topEnd - 1; y >= 0 && id < this.grainCount; y--) {
      for (let i = 0; i < W && id < this.grainCount; i++) {
        const idx = y * W + centerOrder[i];
        if (g[idx] === EMPTY) this.put(id++, idx, false);
      }
    }
    if (id < this.grainCount) throw new Error('El reloj no tiene capacidad suficiente');
  }

  put(id: number, idx: number, wake = true): void {
    this.grid[idx] = id + 1;
    this.pos[id] = idx;
    this.still[id] = 0;
    if (wake) this.wake(id);
  }

  /** Saca un grano de la rejilla (deja hueco y despierta a los de alrededor). */
  take(id: number): void {
    const idx = this.pos[id];
    if (idx < 0) return;
    this.grid[idx] = EMPTY;
    this.pos[id] = -1;
    this.wakeAround(idx);
  }

  /** Intercambia la identidad de dos celdas ocupadas. */
  swapCells(a: number, b: number): void {
    const g = this.grid;
    const va = g[a];
    const vb = g[b];
    g[a] = vb;
    g[b] = va;
    this.pos[va - 1] = b;
    this.pos[vb - 1] = a;
  }

  wake(id: number): void {
    if (this.mark[id] !== this.stamp) {
      this.mark[id] = this.stamp;
      this.nxt[this.nxtCount++] = id;
    }
  }

  private wakeCell(idx: number): void {
    const v = this.grid[idx];
    if (v > 0) this.wake(v - 1);
  }

  private wakeAround(idx: number): void {
    const W = this.W;
    if (idx - W - 1 >= 0) {
      this.wakeCell(idx - W - 1);
      this.wakeCell(idx - W);
      this.wakeCell(idx - W + 1);
    }
    this.wakeCell(idx - 1);
    this.wakeCell(idx + 1);
  }

  wakeAll(): void {
    for (let id = 0; id < this.grainCount; id++) {
      if (this.pos[id] >= 0) {
        this.still[id] = 0;
        this.wake(id);
      }
    }
  }

  get pendingActive(): number {
    return this.nxtCount;
  }

  step(): void {
    if (this.agitation > 0.01) this.agitate();

    const list = this.nxt;
    const n = this.nxtCount;
    this.nxt = this.cur;
    this.cur = list;
    this.nxtCount = 0;
    this.stamp++;
    this.activeCount = n;

    const g = this.grid;
    const pos = this.pos;
    const still = this.still;
    const W = this.W;
    const lastRow = (this.H - 1) * W;
    const tabs = Math.abs(this.tilt);
    const tdir = this.tilt > 0 ? 1 : -1;

    for (let i = 0; i < n; i++) {
      const id = list[i];
      const idx = pos[id];
      if (idx < 0) continue;
      let target = -1;
      if (idx < lastRow) {
        const b = idx + W;
        if (g[b] === EMPTY) target = b;
        else {
          const d = tabs > 0 && this.rand() < tabs ? tdir : this.rand() < 0.5 ? -1 : 1;
          if (g[b + d] === EMPTY) target = b + d;
          else if (g[b - d] === EMPTY) target = b - d;
          else if (tabs > 0.05 && g[idx + tdir] === EMPTY && this.rand() < tabs * 0.6) target = idx + tdir;
        }
      }
      if (target >= 0) {
        g[target] = id + 1;
        g[idx] = EMPTY;
        pos[id] = target;
        still[id] = 0;
        this.wake(id);
        this.wakeAround(idx);
      } else if (still[id] < 4) {
        still[id]++;
        this.wake(id);
      }
    }
  }

  /** Lanza granos de la superficie hacia arriba y mezcla identidades entre vecinos. */
  private agitate(): void {
    const a = Math.min(1, this.agitation);
    const { W, H, topEnd, bottomStart } = this.hg;
    const g = this.grid;

    const launches = Math.ceil(a * W * 0.3);
    for (let k = 0; k < launches; k++) {
      const top = this.rand() < 0.5;
      const y0 = top ? 0 : bottomStart;
      const y1 = top ? topEnd : H;
      const x = 1 + Math.floor(this.rand() * (W - 2));
      let y = y0;
      while (y < y1 && g[y * W + x] <= EMPTY) y++;
      if (y >= y1) continue;
      let h = 1 + Math.floor(this.rand() * a * 16);
      let ty = y;
      while (h-- > 0 && ty - 1 >= y0 && g[(ty - 1) * W + x] === EMPTY) ty--;
      if (ty === y) continue;
      const from = y * W + x;
      const id = g[from] - 1;
      g[from] = EMPTY;
      this.put(id, ty * W + x);
      this.wakeAround(from);
    }

    const swaps = Math.floor(a * this.grainCount * 0.03);
    const offsets = [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1];
    for (let k = 0; k < swaps; k++) {
      const id = Math.floor(this.rand() * this.grainCount);
      const idx = this.pos[id];
      if (idx < 0) continue;
      const nb = idx + offsets[Math.floor(this.rand() * 8)];
      if (nb >= 0 && nb < g.length && g[nb] > 0) this.swapCells(idx, nb);
    }
  }

  /** Celda ocupada del bulbo superior más cercana al cuello. */
  findNeckGrain(): number {
    const { W, topEnd, centerOrder } = this.hg;
    for (let y = topEnd - 1; y >= 0; y--) {
      for (let i = 0; i < W; i++) {
        const idx = y * W + centerOrder[i];
        if (this.grid[idx] > 0) return idx;
      }
    }
    return -1;
  }

  /** Celda donde se posa un grano que sale del cuello: la cima de la columna central. */
  findLandingCell(): number {
    const { W, H, bottomStart, centerOrder } = this.hg;
    const x = centerOrder[0];
    let y = bottomStart;
    if (this.grid[y * W + x] === EMPTY) {
      while (y + 1 < H && this.grid[(y + 1) * W + x] === EMPTY) y++;
      return y * W + x;
    }
    for (let yy = bottomStart; yy < H; yy++) {
      for (let i = 0; i < W; i++) {
        const idx = yy * W + centerOrder[i];
        if (this.grid[idx] === EMPTY) return idx;
      }
    }
    return -1;
  }

  /** Número de granos en las filas [y0, y1). */
  countRows(y0: number, y1: number): number {
    let n = 0;
    for (let i = y0 * this.W; i < y1 * this.W; i++) if (this.grid[i] > 0) n++;
    return n;
  }
}
