import { describe, expect, it } from 'vitest';
import { advanceFall, neckOpen, startFall } from './falling';
import { designHourglass } from './hourglass';
import { SandSim } from './sim';

/** Suelta un grano por el cuello como spawnHero y lo deja caer hasta posarse. */
function drop(angle: number, fallMs = 600) {
  const hg = designHourglass(4_000);
  const sim = new SandSim(hg, 4_000, 3);
  sim.pack(1_000);
  const neck = sim.findNeckGrain(0);
  const id = sim.grid[neck] - 1;
  const from = { x: (neck % hg.W) + 0.5, y: Math.floor(neck / hg.W) + 0.5 };
  sim.take(id);
  const est = Math.floor(sim.findLandingCell(0) / hg.W) + 0.5;
  const g = startFall(from.x, from.y, est - from.y, fallMs, hg.W / 2 - 0.5);
  let t = 0;
  let cell = -1;
  const path: Array<{ x: number; y: number }> = [];
  while (cell < 0 && t < 10_000) {
    cell = advanceFall(g, sim, angle, 1000 / 60);
    t += 1000 / 60;
    path.push({ x: g.x, y: g.y });
  }
  return { hg, sim, cell, t, path, est };
}

describe('granos que caen por el cuello', () => {
  it('en vertical, cae recto por el centro y tarda lo previsto', () => {
    const { hg, cell, t, est } = drop(0, 600);
    expect(cell).toBeGreaterThanOrEqual(0);
    expect(Math.abs((cell % hg.W) + 0.5 - hg.W / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.floor(cell / hg.W) + 0.5 - est)).toBeLessThanOrEqual(1);
    expect(t).toBeGreaterThan(550);
    expect(t).toBeLessThan(700);
  });

  it('con el reloj inclinado, al salir del cuello cae hacia donde tira la gravedad', () => {
    const right = drop(0.6);
    const left = drop(-0.6);
    const cx = right.hg.W / 2;
    // Se posa en el lado hacia el que cae, lejos del eje del reloj.
    expect((right.cell % right.hg.W) + 0.5 - cx).toBeGreaterThan(8);
    expect((left.cell % left.hg.W) + 0.5 - cx).toBeLessThan(-8);
    // Y la trayectoria en el bulbo sigue la gravedad: Δx/Δy ≈ tan(0.6), no una vertical.
    const inBulb = right.path.filter((p) => p.y >= right.hg.bottomStart + 2);
    const a = inBulb[0];
    const b = inBulb[inBulb.length - 1];
    expect((b.x - a.x) / (b.y - a.y)).toBeGreaterThan(0.4);
  });

  it('nunca atraviesa el vidrio ni vuelve a cruzar el cuello, incluso boca abajo', () => {
    for (const angle of [Math.PI / 2 - 0.1, Math.PI, -2.5, 1.3]) {
      const { hg, sim, cell } = drop(angle);
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(Math.floor(cell / hg.W)).toBeGreaterThanOrEqual(hg.bottomStart);
      expect(sim.grid[cell]).toBe(0);
    }
  });

  it('el cuello solo deja pasar arena con el reloj razonablemente derecho', () => {
    expect(neckOpen(0)).toBe(true);
    expect(neckOpen(1.2)).toBe(true);
    expect(neckOpen(-1.2)).toBe(true);
    expect(neckOpen(Math.PI / 2)).toBe(false);
    expect(neckOpen(Math.PI)).toBe(false);
  });
});
