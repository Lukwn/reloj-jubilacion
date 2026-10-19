import { describe, expect, it } from 'vitest';
import { designHourglass } from './hourglass';
import { MarbleSim } from './marbles';

function setup(total: number, fallen: number) {
  const hg = designHourglass(total);
  const sim = new MarbleSim(hg, total, 7);
  sim.pack(fallen);
  return { hg, sim };
}

/** Distancia mínima entre dos canicas del mismo bulbo, en proporción a la suma de sus radios (1 = tocándose). */
function minGap(sim: MarbleSim): number {
  let min = Infinity;
  for (let i = 0; i < sim.grainCount; i++) {
    for (let j = i + 1; j < sim.grainCount; j++) {
      if (!sim.bulb[i] || sim.bulb[i] !== sim.bulb[j]) continue;
      min = Math.min(min, Math.hypot(sim.x[i] - sim.x[j], sim.y[i] - sim.y[j]) / (sim.rad[i] + sim.rad[j]));
    }
  }
  return min;
}

/** Canicas de cada bulbo (1 arriba, 2 abajo). */
function inBulb(sim: MarbleSim, b: number): number {
  let n = 0;
  for (let i = 0; i < sim.grainCount; i++) if (sim.bulb[i] === b) n++;
  return n;
}

/** Ninguna canica pasa del tapón del cuello hacia el otro bulbo. */
function neckHolds(sim: MarbleSim, hg: { topEnd: number; bottomStart: number }): boolean {
  for (let i = 0; i < sim.grainCount; i++) {
    if (sim.bulb[i] === 1 && sim.y[i] > hg.topEnd + 0.5 + 1e-3) return false;
    if (sim.bulb[i] === 2 && sim.y[i] < hg.bottomStart - 0.5 - 1e-3) return false;
  }
  return true;
}

function run(sim: MarbleSim, steps: number) {
  for (let i = 0; i < steps; i++) sim.step();
}

describe('canicas', () => {
  it('se empaquetan en su bulbo sin solaparse, con la siguiente junto al cuello', () => {
    const { hg, sim } = setup(600, 200);
    expect(inBulb(sim, 1)).toBe(400);
    expect(inBulb(sim, 2)).toBe(200);
    expect(neckHolds(sim, hg)).toBe(true);
    expect(minGap(sim)).toBeGreaterThan(0.95);
    // La canica del cuello es la siguiente en caer.
    expect(sim.grid[sim.findNeckGrain()] - 1).toBe(200);
  });

  it('se colocan a tresbolillo: cada fila se apoya en los huecos de la de abajo', () => {
    const { sim } = setup(600, 0);
    const slots = sim.layout(1, 600);
    // Filas con al menos tres canicas (la garganta del cuello va de una en una).
    const perRow = new Map<number, number>();
    for (let k = 0; k < 600; k++) {
      const y = Math.round(slots[2 * k + 1] * 1000);
      perRow.set(y, (perRow.get(y) ?? 0) + 1);
    }
    const ys = [...perRow].filter(([, n]) => n >= 3).map(([y]) => y).sort((p, q) => q - p);
    // Filas separadas √3/2 ≈ 0,87 canicas, no 1.
    expect((ys[0] - ys[1]) / 1000).toBeCloseTo(Math.sqrt(3) / 2, 2);
    // Y ningún hueco pisa a otro.
    let min = Infinity;
    for (let i = 0; i < 600; i++) {
      for (let j = i + 1; j < 600; j++) min = Math.min(min, Math.hypot(slots[2 * i] - slots[2 * j], slots[2 * i + 1] - slots[2 * j + 1]));
    }
    expect(min).toBeGreaterThan(0.99);
  });

  it('se asientan y se quedan quietas, sin cruzar el cuello', () => {
    const { hg, sim } = setup(600, 200);
    sim.agitation = 1;
    run(sim, 60);
    sim.agitation = 0;
    run(sim, 600);
    expect(sim.activeCount).toBeLessThan(10);
    expect(inBulb(sim, 1)).toBe(400);
    expect(inBulb(sim, 2)).toBe(200);
    expect(neckHolds(sim, hg)).toBe(true);
    expect(minGap(sim)).toBeGreaterThan(0.9);
  });

  it('boca abajo caen al otro extremo de cada bulbo', () => {
    const { hg, sim } = setup(300, 100);
    const mean = (b: number) => {
      let s = 0;
      let k = 0;
      for (let i = 0; i < 300; i++) if (sim.bulb[i] === b) (s += sim.y[i]), k++;
      return s / k;
    };
    const top = mean(1);
    const bottom = mean(2);
    sim.gravityAngle = Math.PI;
    run(sim, 800);
    expect(mean(1)).toBeLessThan(top - 3);
    expect(mean(2)).toBeLessThan(bottom - 3);
    expect(neckHolds(sim, hg)).toBe(true);
  });

  it('inclinadas, se amontonan hacia el lado que baja', () => {
    const { hg, sim } = setup(300, 0);
    sim.gravityAngle = 0.9;
    run(sim, 800);
    let right = 0;
    for (let i = 0; i < 300; i++) if (sim.x[i] > hg.W / 2) right++;
    expect(right).toBeGreaterThan(180);
  });

  it('sacar una canica por el cuello y posarla abajo conserva su identidad', () => {
    const { hg, sim } = setup(300, 50);
    const neck = sim.findNeckGrain();
    const id = sim.grid[neck] - 1;
    expect(id).toBe(50);
    sim.take(id);
    expect(sim.pointOf(id)).toBeNull();
    const land = sim.findLandingCell();
    expect(Math.floor(land / hg.W)).toBeGreaterThanOrEqual(hg.bottomStart);
    sim.put(id, land);
    run(sim, 300);
    expect(inBulb(sim, 2)).toBe(51);
    expect(sim.grid[sim.pos[id]]).toBe(id + 1);
  });

  it('intercambiar celdas intercambia las canicas', () => {
    const { sim } = setup(100, 0);
    const a = sim.pos[10];
    const b = sim.pos[20];
    const pa = sim.pointOf(10)!;
    sim.swapCells(a, b);
    expect(sim.pointOf(20)).toEqual(pa);
    expect(sim.grid[a]).toBe(21);
  });

  it('el dedo aparta las canicas', () => {
    const { sim } = setup(300, 0);
    const p = sim.pointOf(150)!;
    expect(sim.dig(p.x, p.y, 1.5, 1, 0)).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) {
      if (sim.bulb[i]) expect(Math.hypot(sim.x[i] - p.x, sim.y[i] - p.y)).toBeGreaterThanOrEqual(1.99);
    }
  });

  it('ordenar las deja por fecha y a nivel', () => {
    const { sim } = setup(400, 100);
    sim.gravityAngle = 1.1;
    sim.agitation = 1;
    run(sim, 80);
    sim.agitation = 0;
    sim.gravityAngle = 0;
    run(sim, 200);
    sim.startSort();
    let guard = 0;
    while (sim.sortStep(0.05) && guard++ < 100) sim.step();
    run(sim, 300);
    expect(sim.sorting).toBe(false);
    expect(inBulb(sim, 1)).toBe(300);
    expect(inBulb(sim, 2)).toBe(100);
    // Por fecha: en el bulbo de arriba, las más antiguas (las siguientes en caer) junto al cuello.
    const top = Array.from({ length: 300 }, (_, k) => k + 100);
    const meanY = (ids: number[]) => ids.reduce((t, id) => t + sim.y[id], 0) / ids.length;
    expect(meanY(top.slice(0, 60))).toBeGreaterThan(meanY(top.slice(240)) + 5);
    // A nivel: la canica más alta de cada franja de la superficie está a la misma altura (±1).
    const highest = new Map<number, number>();
    for (const id of top) {
      const band = Math.round(sim.x[id] / 2);
      highest.set(band, Math.min(highest.get(band) ?? Infinity, sim.y[id]));
    }
    const tops = [...highest.values()].sort((p, q) => p - q);
    const inner = tops.slice(0, Math.max(1, tops.length - 2));
    expect(inner[inner.length - 1] - inner[0]).toBeLessThan(2);
  });
});
