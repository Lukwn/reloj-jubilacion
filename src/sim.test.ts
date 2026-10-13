import { describe, expect, it } from 'vitest';
import { designHourglass } from './hourglass';
import { SandSim } from './sim';

function setup(total: number, fallen: number) {
  const hg = designHourglass(total);
  const sim = new SandSim(hg, total, 42);
  sim.pack(fallen);
  return { hg, sim };
}

describe('reloj de arena', () => {
  it('cada bulbo tiene capacidad para todos los granos', () => {
    for (const n of [100, 16_000, 25_000]) expect(designHourglass(n).capacity).toBeGreaterThanOrEqual(n);
  });

  it('empaqueta los granos en su bulbo con los más próximos junto al cuello', () => {
    const { hg, sim } = setup(16_000, 400);
    expect(sim.countRows(0, hg.topEnd)).toBe(15_600);
    expect(sim.countRows(hg.bottomStart, hg.H)).toBe(400);
    expect(sim.grid[sim.findNeckGrain()]).toBe(400 + 1);
  });

  it('agitar no deja pasar ningún grano por el cuello y conserva las identidades', () => {
    const { hg, sim } = setup(16_000, 400);
    for (let f = 0; f < 600; f++) {
      if (f < 300) {
        sim.agitation = 1;
        sim.tilt = f % 40 < 20 ? 0.75 : -0.75;
        if (f % 15 === 0) sim.wakeAll();
      } else {
        sim.agitation = 0;
        sim.tilt = 0;
      }
      sim.step();
    }
    expect(sim.countRows(0, hg.topEnd)).toBe(15_600);
    expect(sim.countRows(hg.topEnd, hg.bottomStart)).toBe(0);
    expect(sim.countRows(hg.bottomStart, hg.H)).toBe(400);
    const cells = new Set<number>();
    for (let id = 0; id < 16_000; id++) {
      expect(sim.grid[sim.pos[id]]).toBe(id + 1);
      cells.add(sim.pos[id]);
    }
    expect(cells.size).toBe(16_000);
  });

  it('la arena se asienta y se duerme', () => {
    const { sim } = setup(5_000, 100);
    sim.agitation = 1;
    sim.wakeAll();
    let f = 0;
    for (; f < 3000 && (f < 50 || sim.pendingActive > 0); f++) {
      if (f >= 50) sim.agitation = 0;
      sim.step();
    }
    expect(sim.pendingActive).toBe(0);
  });

  it('un grano sacado del cuello cae y se posa en el bulbo inferior', () => {
    const { hg, sim } = setup(2_000, 10);
    const id = sim.grid[sim.findNeckGrain()] - 1;
    sim.take(id);
    const land = sim.findLandingCell();
    expect(Math.floor(land / hg.W)).toBeGreaterThanOrEqual(hg.bottomStart);
    sim.put(id, land);
    for (let f = 0; f < 200; f++) sim.step();
    expect(sim.countRows(0, hg.topEnd)).toBe(1_989);
    expect(sim.countRows(hg.bottomStart, hg.H)).toBe(11);
  });
});
