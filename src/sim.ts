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
  /**
   * Dirección de la gravedad en radianes: 0 = hacia abajo, π/2 = hacia la derecha, π = boca
   * abajo. La cambia el giroscopio del móvil; `tilt` la inclina un poco más mientras se agita.
   */
  gravityAngle = 0;

  /** Dirección efectiva de la gravedad: la del reloj más el ladeo de la agitación. */
  get fallAngle(): number {
    return this.gravityAngle + this.tilt * 0.6;
  }

  /** La gravedad apunta más hacia arriba que hacia abajo: el reloj está boca abajo. */
  get gravityUp(): boolean {
    return Math.cos(this.gravityAngle) < 0;
  }
  /** Granos procesados en el último paso. */
  activeCount = 0;

  /** Desplazamiento de índice de las 8 direcciones (0 abajo, 1 abajo-derecha, 2 derecha… 7 abajo-izquierda). */
  private readonly dirs: Int32Array;
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
    const W = hg.W;
    this.dirs = Int32Array.from([W, W + 1, 1, -W + 1, -W, -W - 1, -1, W - 1]);
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
    // Con la gravedad girada, también pueden caer al hueco los de debajo.
    if (this.gravityAngle !== 0 && idx + W + 1 < this.grid.length) {
      this.wakeCell(idx + W - 1);
      this.wakeCell(idx + W);
      this.wakeCell(idx + W + 1);
    }
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
    // Las 8 direcciones de la rejilla, en orden de ángulo: 0 abajo, 2 derecha, 4 arriba, 6 izquierda.
    const dirs = this.dirs;
    // Gravedad entre dos direcciones: cada grano cae por una u otra según lo cerca que esté.
    const angle = this.fallAngle;
    let u = (angle / (Math.PI / 4)) % 8;
    if (u < 0) u += 8;
    const k0 = Math.floor(u);
    const frac = u - k0;

    // Orden aleatorio: cuando varios granos pueden caer al mismo hueco gana el primero que se
    // procesa. Con un orden fijo ganaría siempre el mismo lado y los huecos que deja cada grano
    // al salir subirían ladeados, vaciando un lado del bulbo antes que el otro.
    for (let j = n - 1; j > 0; j--) {
      const r = Math.floor(this.rand() * (j + 1));
      const t = list[j];
      list[j] = list[r];
      list[r] = t;
    }
    for (let j = 0; j < n; j++) {
      const id = list[j];
      const idx = pos[id];
      if (idx < 0) continue;
      let target = -1;
      // Hacia la gravedad; si está ocupado, por una de las dos diagonales (ángulo de reposo).
      const k = this.rand() < frac ? (k0 + 1) & 7 : k0;
      const fall = idx + dirs[k];
      if (g[fall] === EMPTY) target = fall;
      else {
        const side = this.rand() < 0.5 ? 1 : 7;
        const a = idx + dirs[(k + side) & 7];
        const b = idx + dirs[(k + 8 - side) & 7];
        if (g[a] === EMPTY) target = a;
        else if (g[b] === EMPTY) target = b;
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

  /** Lanza granos de la superficie contra la gravedad y mezcla identidades entre vecinos. */
  private agitate(): void {
    const a = Math.min(1, this.agitation);
    const { W, H, topEnd, bottomStart } = this.hg;
    const g = this.grid;
    // Hacia dónde salen despedidos: contra la gravedad.
    const dir = this.gravityUp ? 1 : -1;

    const launches = Math.ceil(a * W * 0.3);
    for (let k = 0; k < launches; k++) {
      const top = this.rand() < 0.5;
      const y0 = top ? 0 : bottomStart;
      const y1 = top ? topEnd : H;
      const x = 1 + Math.floor(this.rand() * (W - 2));
      // Superficie de la columna: el primer grano empezando por el lado libre.
      let y = dir < 0 ? y0 : y1 - 1;
      while (y >= y0 && y < y1 && g[y * W + x] <= EMPTY) y -= dir;
      if (y < y0 || y >= y1) continue;
      let h = 1 + Math.floor(this.rand() * a * 16);
      let ty = y;
      while (h-- > 0 && ty + dir >= y0 && ty + dir < y1 && g[(ty + dir) * W + x] === EMPTY) ty += dir;
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

  /**
   * Remueve la arena de un círculo (el dedo o el ratón al arrastrar) sin sacar ningún grano
   * de su bulbo. (cx, cy) y r van en celdas; (dx, dy) es la dirección del arrastre.
   * - Cerca de la superficie, cada grano se aparta a la celda libre más próxima fuera del
   *   círculo: se abre un surco con la arena amontonada a los lados.
   * - Dentro de la arena compacta no hay sitio libre cerca, así que los granos de delante del
   *   dedo pasan detrás (se intercambian), como al pasar un palo: la arena se mezcla a lo largo
   *   del trazo. Devuelve los granos movidos o intercambiados.
   */
  dig(cx: number, cy: number, r: number, dx: number, dy: number): number {
    const { W, H, topEnd, bottomStart } = this.hg;
    const g = this.grid;
    const dl = Math.hypot(dx, dy);
    const ux = dl > 0 ? dx / dl : 0;
    const uy = dl > 0 ? dy / dl : 0;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
    let moved = 0;
    for (let y = y0; y <= y1; y++) {
      // El bulbo de cada fila: los granos nunca cambian de bulbo (el cuello es sólido).
      const lo = y < topEnd ? 0 : bottomStart;
      const hi = y < topEnd ? topEnd : H;
      for (let x = x0; x <= x1; x++) {
        const ox = x + 0.5 - cx;
        const oy = y + 0.5 - cy;
        if (ox * ox + oy * oy > r * r) continue;
        const from = y * W + x;
        const v = g[from];
        if (v <= 0) continue;
        const to = this.pushTarget(x, y, ox, oy, ux, uy, cx, cy, r, lo, hi);
        if (to >= 0) {
          g[from] = EMPTY;
          this.put(v - 1, to);
          this.wakeAround(from);
          moved++;
          continue;
        }
        // Arena compacta: lo de delante del dedo pasa detrás, reflejado respecto a su centro.
        const ahead = ox * ux + oy * uy;
        if (dl === 0 || ahead <= 0) continue;
        const bx = Math.floor(x + 0.5 - 2 * ahead * ux + (this.rand() - 0.5) * 2);
        const by = Math.floor(y + 0.5 - 2 * ahead * uy);
        if (bx < 0 || bx >= W || by < lo || by >= hi) continue;
        const back = by * W + bx;
        const bv = g[back];
        if (bv === WALL || back === from) continue;
        if (bv === EMPTY) {
          g[from] = EMPTY;
          this.put(v - 1, back);
          this.wakeAround(from);
        } else {
          this.swapCells(from, back);
          this.wake(v - 1);
          this.wake(bv - 1);
        }
        moved++;
      }
    }
    return moved;
  }

  /** Primera celda libre fuera del círculo en la dirección de empuje del grano, o -1. */
  private pushTarget(
    x: number,
    y: number,
    ox: number,
    oy: number,
    ux: number,
    uy: number,
    cx: number,
    cy: number,
    r: number,
    lo: number,
    hi: number,
  ): number {
    const W = this.W;
    const g = this.grid;
    const ol = Math.hypot(ox, oy);
    // Hacia fuera del dedo, un poco hacia donde se arrastra y un poco hacia arriba,
    // para que la arena apartada se amontone en los bordes del surco.
    let bx = (ol > 0.01 ? ox / ol : 0) + ux * 0.8;
    const against = this.gravityUp ? 1 : -1;
    let by = (ol > 0.01 ? oy / ol : against) + uy * 0.8 + 0.35 * against;
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl;
    by /= bl;
    const dirs = [
      [bx, by],
      [bx * 0.8 - by * 0.6, bx * 0.6 + by * 0.8],
      [bx * 0.8 + by * 0.6, -bx * 0.6 + by * 0.8],
      [0, against],
    ];
    // Solo celdas cercanas: la arena apartada se queda junto al dedo, no salta lejos.
    const maxT = 2 * r + 4;
    for (const [ddx, ddy] of dirs) {
      for (let t = 0.75; t < maxT; t += 0.75) {
        const px = x + 0.5 + ddx * t;
        const py = y + 0.5 + ddy * t;
        const gx = Math.floor(px);
        const gy = Math.floor(py);
        if (gx < 0 || gx >= W || gy < lo || gy >= hi) break;
        const c = g[gy * W + gx];
        if (c === WALL) break;
        if (c !== EMPTY) continue;
        if ((gx + 0.5 - cx) ** 2 + (gy + 0.5 - cy) ** 2 <= r * r) continue;
        return gy * W + gx;
      }
    }
    return -1;
  }

  /** Ordenación en curso: celdas de cada bulbo en orden y el id que debe acabar en cada una. */
  private sortCells: Int32Array[] = [];
  private sortIds: Int32Array[] = [];
  private sortAt: number[] = [];

  get sorting(): boolean {
    return this.sortCells.some((c, i) => this.sortAt[i] < c.length);
  }

  /**
   * Empieza a ordenar y nivelar la arena de cada bulbo: cada grano acabará donde lo pondría
   * `pack`, con la superficie plana y el más antiguo de cada bulbo abajo (arriba, junto al
   * cuello) y desde el centro. Se avanza con `sortStep`.
   */
  startSort(): void {
    const { W, H, topEnd, bottomStart, centerOrder } = this.hg;
    const g = this.grid;
    this.sortCells = [];
    this.sortIds = [];
    this.sortAt = [];
    for (const [y0, y1] of [
      [0, topEnd],
      [bottomStart, H],
    ]) {
      const ids: number[] = [];
      for (let i = y0 * W; i < y1 * W; i++) if (g[i] > 0) ids.push(g[i] - 1);
      ids.sort((a, b) => a - b);
      // Las celdas que ocuparía la arena recién empaquetada, de abajo arriba.
      const cells: number[] = [];
      for (let y = y1 - 1; y >= y0 && cells.length < ids.length; y--) {
        for (let i = 0; i < W && cells.length < ids.length; i++) {
          const idx = y * W + centerOrder[i];
          if (g[idx] !== WALL) cells.push(idx);
        }
      }
      this.sortCells.push(Int32Array.from(cells));
      this.sortIds.push(Int32Array.from(ids));
      this.sortAt.push(0);
    }
  }

  /**
   * Coloca en su sitio una fracción de los granos de cada bulbo, de abajo arriba: si la celda
   * está ocupada por otro grano, se intercambian; si está vacía, el grano se mueve a ella y deja
   * un hueco donde estaba, que la arena de encima rellena al caer. Devuelve si queda trabajo.
   */
  sortStep(fraction: number): boolean {
    const g = this.grid;
    const split = this.hg.topEnd * this.W;
    for (let b = 0; b < this.sortCells.length; b++) {
      const top = b === 0;
      const cells = this.sortCells[b];
      const ids = this.sortIds[b];
      const end = Math.min(cells.length, this.sortAt[b] + Math.ceil(cells.length * fraction));
      for (let i = this.sortAt[b]; i < end; i++) {
        const cell = cells[i];
        const id = ids[i];
        const from = this.pos[id];
        // Un grano que está cayendo por el cuello, o que ya lo ha cruzado, no es de este bulbo.
        if (from < 0 || from === cell || top !== from < split) continue;
        if (g[cell] > 0) this.swapCells(cell, from);
        else if (g[cell] === EMPTY) {
          g[from] = EMPTY;
          this.put(id, cell);
          this.wakeAround(from);
        }
      }
      this.sortAt[b] = end;
    }
    return this.sorting;
  }

  stopSort(): void {
    this.sortCells = [];
    this.sortIds = [];
    this.sortAt = [];
  }

  /**
   * El ancho es par: centerOrder empareja columnas a la misma distancia del centro (izquierda y
   * derecha). Se alterna cuál va primero en cada llamada para no vaciar ni llenar un lado antes.
   */
  private neckFlip = 0;
  private landFlip = 0;

  /**
   * Celda ocupada del bulbo superior más cercana al cuello. Sin `side` alterna el lado del
   * empate en cada llamada; con `side` (0 o 1) siempre elige el mismo, para quien la consulta
   * en cada fotograma sin sacar el grano.
   */
  findNeckGrain(side?: 0 | 1): number {
    const { W, topEnd, centerOrder } = this.hg;
    const f = side ?? (this.neckFlip ^= 1);
    for (let y = topEnd - 1; y >= 0; y--) {
      for (let i = 0; i < W; i++) {
        const idx = y * W + centerOrder[i ^ f];
        if (this.grid[idx] > 0) return idx;
      }
    }
    return -1;
  }

  /** Celda donde se posa un grano que sale del cuello: la cima de la columna central. */
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

  /** Número de granos en las filas [y0, y1). */
  countRows(y0: number, y1: number): number {
    let n = 0;
    for (let i = y0 * this.W; i < y1 * this.W; i++) if (this.grid[i] > 0) n++;
    return n;
  }
}
