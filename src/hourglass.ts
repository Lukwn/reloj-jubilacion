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

/** Perfil base: sube como un seno desde el cuello hasta la parte más ancha (t = 0,72). */
function rise(t: number): number {
  return Math.sin((Math.PI / 2) * Math.min(1, t / 0.72));
}

/** Tramo junto al cuello que se redondea, para que la cintura no haga pico. */
const FILLET = 0.1;

/**
 * Perfil del bulbo: t = 0 en el cuello, t = 1 en la tapa. Devuelve 0..1. Es el perfil de seno de
 * siempre, con dos retoques: junto al cuello, una parábola que empalma con él con la misma
 * pendiente y sale en horizontal (cintura redondeada en vez de una X), y bajo la tapa, un hombro
 * que se cierra un poco.
 */
export function bulbShape(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  const k = (Math.PI / 2 / 0.72) * Math.cos((Math.PI / 2) * (FILLET / 0.72));
  const a = k / (2 * FILLET);
  // Lo que la parábola deja de más en el cuello: se descuenta para que siga midiendo lo mismo.
  const g0 = rise(FILLET) - a * FILLET * FILLET;
  let g = u < FILLET ? rise(FILLET) - a * (FILLET * FILLET - u * u) : rise(u);
  g = (g - g0) / (1 - g0);
  if (u > 0.86) {
    const v = (u - 0.86) / 0.14;
    g *= 1 - 0.16 * v * v;
  }
  return g;
}

export const ASPECT = 0.6; // ancho / alto
const MARGIN = 1.12; // holgura de capacidad sobre el total de granos

function build(bulbRows: number): Hourglass {
  // Con pocos granos (años, nóminas) cada celda es una canica grande: basta un cuello corto.
  const neckRows = bulbRows < 40 ? 1 : Math.max(4, Math.round(bulbRows * 0.05));
  const H = bulbRows * 2 + neckRows;
  let W = Math.round(H * ASPECT);
  if (W % 2) W++;
  const maxHalf = W / 2 - 1;
  // Con canicas, el cuello deja pasar justo una (el vidrio se dibuja 0,6 celdas más ancho).
  const neckHalf = bulbRows < 40 ? 0.08 : Math.max(1, W * 0.016);
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

/**
 * Semiancho interior del vidrio a una altura cualquiera `y` (en celdas, con decimales): la curva
 * continua de la que salen las filas. El vidrio se dibuja con ella (más 0,6 de holgura), no con
 * las filas, que con pocos granos son pocas y dejarían un contorno poligonal.
 */
export function profileHalf(hg: Hourglass, y: number): number {
  const { topEnd, bottomStart, neckHalf, maxHalf } = hg;
  const t = y <= topEnd ? (topEnd - y) / topEnd : y >= bottomStart ? (y - bottomStart) / topEnd : 0;
  return neckHalf + (maxHalf - neckHalf) * bulbShape(Math.min(1, t));
}

export function isInterior(hg: Hourglass, x: number, y: number): boolean {
  if (y < 0 || y >= hg.H || (y >= hg.topEnd && y < hg.bottomStart)) return false;
  return Math.abs(x + 0.5 - hg.W / 2) <= hg.half[y];
}

/** El reloj más pequeño en el que cada bulbo puede contener todos los granos con holgura. */
export function designHourglass(grains: number): Hourglass {
  const needed = Math.ceil(grains * MARGIN) + 20;
  // La capacidad crece con las filas: se dobla hasta pasarse y luego se busca por bisección
  // (con decenas de miles de granos, probar fila a fila tardaría).
  let lo = 8;
  let hi = 8;
  while (build(hi).capacity < needed) {
    lo = hi;
    hi *= 2;
  }
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (build(mid).capacity >= needed) hi = mid;
    else lo = mid + 1;
  }
  return build(hi);
}
