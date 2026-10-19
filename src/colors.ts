import { weekday } from './dates';
import { hash32 } from './phrases';
import { groupOfGrain, type GrainSet } from './units';

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Color de cada grano empaquetado como píxel RGBA (little-endian) para ImageData.
 * Variación aleatoria pero estable por grano. En días, los lunes algo más tostados, los
 * viernes más dorados y los fines de semana y festivos más claros; en nóminas, las pagas
 * extra doradas.
 */
export function grainColors(set: GrainSet, seed: number, isWorkday?: (day: number) => boolean): Uint32Array {
  const out = new Uint32Array(set.total);
  for (let id = 0; id < set.total; id++) {
    const r = hash32(id * 7919 + seed);
    const j1 = (r & 0xff) / 255 - 0.5;
    const j2 = ((r >>> 8) & 0xff) / 255 - 0.5;
    const j3 = ((r >>> 16) & 0xff) / 255 - 0.5;
    let h = 38 + j1 * 8;
    let s = 0.55 + j2 * 0.16;
    let l = 0.64 + j3 * 0.16;
    // En días, los tonos de la semana son sutiles, del orden de la variación al azar de cada grano:
    // se repiten cada siete granos y, como se colocan seguidos, más contraste dibujaría arcos
    // (moiré) en la arena.
    const wd = set.unit === 'dias' ? weekday(set.days[id]) : -1;
    if (wd === 1) {
      h -= 4;
      l -= 0.025;
    } else if (wd === 5) {
      h += 3;
      s += 0.05;
      l += 0.015;
    } else if (set.extra?.[id]) {
      // Las pagas extra sí destacan: son pocas y no siguen un ritmo fijo entre las canicas.
      h += 6;
      s += 0.27;
      l += 0.04;
    }
    if (wd >= 0 && isWorkday && !isWorkday(set.days[id])) {
      s -= 0.04;
      l += 0.02;
    }
    const [R, G, B] = hslToRgb(h, s, l);
    out[id] = ((255 << 24) | (B << 16) | (G << 8) | R) >>> 0;
  }
  return out;
}

/** La misma paleta casi transparente, para atenuar granos. */
export function dimColors(colors: Uint32Array): Uint32Array {
  const out = new Uint32Array(colors.length);
  for (let i = 0; i < colors.length; i++) out[i] = ((colors[i] & 0x00ffffff) | (80 << 24)) >>> 0;
  return out;
}

export function unpackColor(c: number): string {
  return `rgb(${c & 0xff},${(c >>> 8) & 0xff},${(c >>> 16) & 0xff})`;
}

/** Tonos de arena de colores (h, s, l) para las capas por años. Dos años seguidos nunca se repiten. */
const LAYER_TONES: ReadonlyArray<[number, number, number]> = [
  [38, 0.58, 0.64], // ocre
  [14, 0.55, 0.58], // terracota
  [95, 0.24, 0.58], // salvia
  [182, 0.3, 0.52], // turquesa apagado
  [45, 0.42, 0.8], // crema
  [215, 0.34, 0.62], // azul polvo
  [350, 0.42, 0.68], // rosa palo
  [300, 0.2, 0.56], // ciruela
];

export interface YearLayers {
  /** Color de cada grano según su grupo. */
  colors: Uint32Array;
  /** El mismo color, casi transparente, para atenuar los demás grupos al resaltar uno. */
  dim: Uint32Array;
  /** Grupo de cada grano: el año (o la hora, en la unidad de segundos). */
  yearOf: Uint16Array;
  /** Número de granos de cada grupo. */
  counts: Map<number, number>;
  /** Primer grano de cada grupo: los granos de un grupo son consecutivos. */
  first: Map<number, number>;
}

/** Capas de colores: un tono por año (o por hora, en segundos). */
export function yearLayers(set: GrainSet, seed: number): YearLayers {
  const n = set.total;
  const colors = new Uint32Array(n);
  const dim = new Uint32Array(n);
  const yearOf = new Uint16Array(n);
  const counts = new Map<number, number>();
  const first = new Map<number, number>();
  for (let id = 0; id < n; id++) {
    const year = groupOfGrain(set, id);
    yearOf[id] = year;
    if (!first.has(year)) first.set(year, id);
    counts.set(year, (counts.get(year) ?? 0) + 1);
    const [h0, s0, l0] = LAYER_TONES[year % LAYER_TONES.length];
    const r = hash32(id * 7919 + seed);
    const j1 = (r & 0xff) / 255 - 0.5;
    const j2 = ((r >>> 8) & 0xff) / 255 - 0.5;
    const [R, G, B] = hslToRgb(h0 + j1 * 6, s0, l0 + j2 * 0.1);
    colors[id] = ((255 << 24) | (B << 16) | (G << 8) | R) >>> 0;
    dim[id] = ((80 << 24) | (B << 16) | (G << 8) | R) >>> 0;
  }
  return { colors, dim, yearOf, counts, first };
}
