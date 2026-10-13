import { grainDay, weekday, type Life } from './dates';
import { hash32 } from './phrases';

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Color de cada grano empaquetado como píxel RGBA (little-endian) para ImageData.
 * Variación aleatoria pero estable por grano; los lunes algo más tostados, los viernes más dorados.
 */
export function grainColors(life: Life): Uint32Array {
  const out = new Uint32Array(life.total);
  for (let id = 0; id < life.total; id++) {
    const day = grainDay(life, id);
    const r = hash32(id * 7919 + life.startDay);
    const j1 = (r & 0xff) / 255 - 0.5;
    const j2 = ((r >>> 8) & 0xff) / 255 - 0.5;
    const j3 = ((r >>> 16) & 0xff) / 255 - 0.5;
    let h = 38 + j1 * 8;
    let s = 0.55 + j2 * 0.16;
    let l = 0.64 + j3 * 0.16;
    const wd = weekday(day);
    if (wd === 1) {
      h -= 9;
      s -= 0.06;
      l -= 0.07;
    } else if (wd === 5) {
      h += 6;
      s += 0.12;
      l += 0.04;
    }
    const [R, G, B] = hslToRgb(h, s, l);
    out[id] = ((255 << 24) | (B << 16) | (G << 8) | R) >>> 0;
  }
  return out;
}

export function unpackColor(c: number): string {
  return `rgb(${c & 0xff},${(c >>> 8) & 0xff},${(c >>> 16) & 0xff})`;
}
