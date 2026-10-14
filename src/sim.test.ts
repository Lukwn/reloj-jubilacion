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
    expect(sim.grid[sim.findNeckGrain(0)]).toBe(400 + 1);
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

  it("remover en la superficie abre un hueco y nunca cambia un grano de bulbo", () => {
    const { hg, sim } = setup(16_000, 3_000);
    const cx = hg.W / 2;
    // Superficie de la arena de arriba: primera fila ocupada de la columna central.
    let top = 0;
    while (sim.grid[top * hg.W + Math.floor(cx)] <= 0) top++;
    const inCircle = (x: number, y: number, r: number) => {
      let n = 0;
      for (let gy = Math.floor(y - r); gy <= y + r; gy++) {
        for (let gx = Math.floor(x - r); gx <= x + r; gx++) {
          if ((gx + 0.5 - x) ** 2 + (gy + 0.5 - y) ** 2 <= r * r && sim.grid[gy * hg.W + gx] > 0) n++;
        }
      }
      return n;
    };
    const before = inCircle(cx, top + 2, 6);
    expect(sim.dig(cx, top + 2, 6, 1, 0)).toBeGreaterThan(0);
    expect(inCircle(cx, top + 2, 6)).toBeLessThan(before / 3);
    // Dentro de la arena compacta y justo encima del cuello: mezcla, pero no pasa nada por el cuello.
    sim.dig(cx, hg.topEnd - 12, 6, 1, 0);
    sim.dig(cx, hg.topEnd - 2, 6, 0, 1);
    sim.dig(cx - 4, hg.H - 6, 6, -1, 0);
    expect(sim.countRows(0, hg.topEnd)).toBe(13_000);
    expect(sim.countRows(hg.topEnd, hg.bottomStart)).toBe(0);
    expect(sim.countRows(hg.bottomStart, hg.H)).toBe(3_000);
  });

  it("pasar el dedo por la arena compacta mezcla los granos del trazo", () => {
    const { hg, sim } = setup(16_000, 0);
    const y = hg.topEnd - 20;
    const before = Array.from(sim.pos);
    for (let x = hg.W * 0.3; x < hg.W * 0.7; x += 2) sim.dig(x, y, 5, 1, 0);
    let changed = 0;
    for (let id = 0; id < 16_000; id++) if (sim.pos[id] !== before[id]) changed++;
    expect(changed).toBeGreaterThan(50);
    expect(sim.countRows(0, hg.topEnd)).toBe(16_000);
  });
  it("arrastrar por toda la arena conserva las identidades y vuelve a asentarse", () => {
    const { hg, sim } = setup(8_000, 2_000);
    for (let f = 0; f < 400; f++) {
      if (f < 200) {
        const t = f / 200;
        // Zigzag por los dos bulbos, de lado a lado y de arriba abajo.
        const x = hg.W * (0.5 + 0.4 * Math.sin(t * Math.PI * 6));
        const y = hg.H * t;
        sim.dig(x, y, 5, Math.cos(t * Math.PI * 6), 1);
      }
      sim.step();
    }
    expect(sim.countRows(0, hg.topEnd)).toBe(6_000);
    expect(sim.countRows(hg.bottomStart, hg.H)).toBe(2_000);
    const cells = new Set<number>();
    for (let id = 0; id < 8_000; id++) {
      expect(sim.grid[sim.pos[id]]).toBe(id + 1);
      cells.add(sim.pos[id]);
    }
    expect(cells.size).toBe(8_000);
    for (let f = 0; f < 3000 && sim.pendingActive > 0; f++) sim.step();
    expect(sim.pendingActive).toBe(0);
  });

  it('boca abajo, la arena cae al otro extremo de cada bulbo sin cruzar el cuello', () => {
    const { hg, sim } = setup(8_000, 2_000);
    const meanRow = (y0: number, y1: number) => {
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < hg.W; x++) {
          if (sim.grid[y * hg.W + x] > 0) {
            sum += y;
            n++;
          }
        }
      }
      return sum / n;
    };
    const topBefore = meanRow(0, hg.topEnd);
    const bottomBefore = meanRow(hg.bottomStart, hg.H);
    sim.gravityAngle = Math.PI;
    sim.wakeAll();
    for (let f = 0; f < 1500 && (f < 10 || sim.pendingActive > 0); f++) sim.step();
    expect(meanRow(0, hg.topEnd)).toBeLessThan(topBefore - 10);
    expect(meanRow(hg.bottomStart, hg.H)).toBeLessThan(bottomBefore - 10);
    expect(sim.countRows(0, hg.topEnd)).toBe(6_000);
    expect(sim.countRows(hg.topEnd, hg.bottomStart)).toBe(0);
    expect(sim.countRows(hg.bottomStart, hg.H)).toBe(2_000);
    for (let id = 0; id < 8_000; id++) expect(sim.grid[sim.pos[id]]).toBe(id + 1);
  });

  it('con el móvil inclinado, la arena se amontona hacia ese lado', () => {
    const { hg, sim } = setup(8_000, 0);
    const half = (fromX: number, toX: number) => {
      let n = 0;
      for (let y = 0; y < hg.topEnd; y++) for (let x = fromX; x < toX; x++) if (sim.grid[y * hg.W + x] > 0) n++;
      return n;
    };
    sim.gravityAngle = 1.2;
    sim.wakeAll();
    for (let f = 0; f < 1500; f++) {
      if (f % 50 === 0) sim.wakeAll();
      sim.step();
    }
    const mid = Math.floor(hg.W / 2);
    expect(half(mid, hg.W)).toBeGreaterThan(half(0, mid) * 1.15);
    expect(sim.countRows(0, hg.topEnd)).toBe(8_000);
  });

  it('ordenar nivela la arena y deja cada bulbo por fecha, como recién empaquetada', () => {
    const { sim } = setup(8_000, 2_000);
    // Se remueve y se inclina para que la arena quede revuelta y con montículos.
    sim.gravityAngle = 1.2;
    for (let f = 0; f < 300; f++) {
      if (f < 100) {
        sim.agitation = 1;
        if (f % 15 === 0) sim.wakeAll();
      } else sim.agitation = 0;
      sim.step();
    }
    sim.gravityAngle = 0;
    sim.startSort();
    let guard = 0;
    // Mientras se ordena, la simulación sigue corriendo, como en la app.
    while (sim.sortStep(0.05) && guard++ < 100) sim.step();
    for (let f = 0; f < 200; f++) sim.step();
    expect(sim.sorting).toBe(false);
    const fresh = setup(8_000, 2_000).sim;
    expect(Array.from(sim.grid)).toEqual(Array.from(fresh.grid));
  });

  it('la caída rápida es simétrica: no vacía un lado antes ni ladea las fechas', () => {
    // Como la reproducción rápida de la app: unos 22 granos por fotograma, 520 ms de vuelo,
    // y las mismas llamadas que spawnHero y landHero.
    const N = 11_000;
    const { hg, sim } = setup(N, 0);
    const cx = hg.W / 2;
    const fallen = Math.floor(N * 0.7);
    const inFlight: Array<{ id: number; at: number }> = [];
    let next = 0;
    for (let f = 0; next < fallen || inFlight.length; f++) {
      for (let k = 0; k < 22 && next < fallen; k++) {
        const id = next++;
        const neck = sim.findNeckGrain();
        if (neck !== sim.pos[id]) sim.swapCells(neck, sim.pos[id]);
        sim.take(id);
        sim.findLandingCell(0);
        inFlight.push({ id, at: f + 31 });
      }
      while (inFlight.length && inFlight[0].at <= f) sim.put(inFlight.shift()!.id, sim.findLandingCell());
      sim.step();
      sim.step();
    }
    for (let f = 0; f < 600; f++) sim.step();
    const meanDx = (from: number, to: number) => {
      let s = 0;
      for (let id = from; id < to; id++) s += (sim.pos[id] % hg.W) + 0.5 - cx;
      return s / (to - from);
    };
    // Antes del arreglo, la arena de arriba quedaba ~20 celdas a la derecha y las fechas de abajo
    // hasta ~15. Ahora el desvío es de una o dos celdas sobre una semianchura de ~70.
    expect(Math.abs(meanDx(fallen, N))).toBeLessThan(4);
    for (let d = 0; d < 10; d++) {
      const from = Math.floor((fallen * d) / 10);
      expect(Math.abs(meanDx(from, Math.floor((fallen * (d + 1)) / 10)))).toBeLessThan(4);
    }
    expect(sim.countRows(0, hg.topEnd)).toBe(N - fallen);
    expect(sim.countRows(hg.bottomStart, hg.H)).toBe(fallen);
  });

  it('la reproducción lenta abre un cráter centrado: los huecos suben rectos', () => {
    // Un grano cada 3 fotogramas (≈ 1 mes por segundo): cada hueco sube solo por la arena quieta.
    const N = 11_000;
    const drops = 2_000;
    const { hg, sim } = setup(N, 0);
    for (let f = 0, next = 0; next < drops; f++) {
      if (f % 3 === 0) {
        const id = next++;
        const neck = sim.findNeckGrain();
        if (neck !== sim.pos[id]) sim.swapCells(neck, sim.pos[id]);
        sim.take(id);
        sim.put(id, sim.findLandingCell());
      }
      sim.step();
      sim.step();
    }
    for (let f = 0; f < 2000; f++) sim.step();
    // Profundidad media de la superficie de arriba en cada mitad (sin los bordes).
    const depth = (from: number, to: number) => {
      let s = 0;
      for (let x = from; x < to; x++) {
        let y = 0;
        while (y < hg.topEnd && sim.grid[y * hg.W + x] <= 0) y++;
        s += y;
      }
      return s / (to - from);
    };
    const q = Math.floor(hg.W / 8);
    const left = depth(q, hg.W / 2);
    const right = depth(hg.W / 2, hg.W - q);
    // Con el orden de proceso fijo, la derecha se hundía 42 filas y la izquierda 16.
    expect(Math.abs(left - right)).toBeLessThan(3);
  });
});
