// Geometría del reloj de arena sobre una rejilla de celdas.
// Filas [0, topEnd) = bulbo superior, [topEnd, bottomStart) = cuello (sólido),
// [bottomStart, H) = bulbo inferior. Ambos bulbos son simétricos.

export interface Hourglass {
  W: number;
  H: number;
  topEnd: number;
  bottomStart: number;
  /** Semianchura interior de cada fila, en celdas (en el cuello, la del tubo dibujado). */
  half: Float32Array;
  neckHalf: number;
  maxHalf: number;
  /** Capacidad de cada bulbo, en granos. */
  capacity: number;
  /** Columnas ordenadas del centro hacia fuera. */
  centerOrder: Int32Array;
}

/** Perfil del bulbo: t = 0 en el cuello, t = 1 en la tapa. Devuelve 0..1. */
export function bulbShape(t: number): number {
  const rise = Math.sin((Math.PI / 2) * Math.min(1, t / 0.72));
  let g = Math.pow(rise, 0.85);
  if (t > 0.86) {
    const u = (t - 0.86) / 0.14;
    g *= 1 - 0.16 * u * u;
  }
  return g;
}

export const ASPECT = 0.6; // ancho / alto
const MARGIN = 1.12; // holgura de capacidad sobre el total de granos

function build(bulbRows: number): Hourglass {
  const neckRows = Math.max(4, Math.round(bulbRows * 0.05));
  const H = bulbRows * 2 + neckRows;
  let W = Math.round(H * ASPECT);
  if (W % 2) W++;
  const maxHalf = W / 2 - 1;
  const neckHalf = Math.max(1, W * 0.016);
  const half = new Float32Array(H);
  const topEnd = bulbRows;
  const bottomStart = bulbRows + neckRows;
  for (let y = 0; y < H; y++) {
    if (y < topEnd) {
      const t = (topEnd - y - 0.5) / bulbRows;
      half[y] = neckHalf + (maxHalf - neckHalf) * bulbShape(t);
    } else if (y < bottomStart) {
      half[y] = neckHalf;
    } else {
      const t = (y - bottomStart + 0.5) / bulbRows;
      half[y] = neckHalf + (maxHalf - neckHalf) * bulbShape(t);
    }
  }
  const centerOrder = Int32Array.from({ length: W }, (_, x) => x).sort(
    (a, b) => Math.abs(a + 0.5 - W / 2) - Math.abs(b + 0.5 - W / 2) || a - b,
  );
  const hg: Hourglass = { W, H, topEnd, bottomStart, half, neckHalf, maxHalf, capacity: 0, centerOrder };
  let capacity = 0;
  for (let y = 0; y < topEnd; y++) for (let x = 0; x < W; x++) if (isInterior(hg, x, y)) capacity++;
  hg.capacity = capacity;
  return hg;
}

export function isInterior(hg: Hourglass, x: number, y: number): boolean {
  if (y < 0 || y >= hg.H || (y >= hg.topEnd && y < hg.bottomStart)) return false;
  return Math.abs(x + 0.5 - hg.W / 2) <= hg.half[y];
}

/** El reloj más pequeño en el que cada bulbo puede contener todos los granos con holgura. */
export function designHourglass(grains: number): Hourglass {
  const needed = Math.ceil(grains * MARGIN) + 20;
  for (let rows = 20; ; rows++) {
    const hg = build(rows);
    if (hg.capacity >= needed) return hg;
  }
}
