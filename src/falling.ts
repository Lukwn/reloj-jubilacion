import { EMPTY, type SandSim } from './sim';

/**
 * Grano que cruza el cuello y cae por el bulbo inferior, fuera de la rejilla, hasta posarse.
 * Coordenadas en celdas de la rejilla; el tiempo, en ms.
 */
export interface FallingGrain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Gravedad (celdas/ms²), ajustada para que la caída en vertical dure lo previsto. */
  accel: number;
  /** Columna por la que baja el tubo del cuello (el centro de una de las dos centrales). */
  lane: number;
  /** Ya ha salido del cuello al bulbo inferior. */
  inBulb: boolean;
  /** Última celda libre que ha atravesado en el bulbo: donde se posa al chocar. */
  lastFree: number;
}

export function startFall(x: number, y: number, fallDistance: number, fallMs: number, lane: number): FallingGrain {
  const d = Math.max(4, fallDistance);
  const accel = fallMs > 0 ? (2 * d) / (fallMs * fallMs) : 1;
  return { x, y, vx: 0, vy: 0, accel, lane, inBulb: false, lastFree: -1 };
}

/** Con el reloj tumbado más de unos 78°, la arena deja de pasar por el cuello. */
export function neckOpen(angle: number): boolean {
  return Math.cos(angle) > 0.2;
}

/**
 * Avanza el grano `dt` ms con la gravedad en la dirección `angle` (0 = hacia abajo de la
 * rejilla, π/2 = hacia la derecha), la misma convención que `SandSim.gravityAngle`.
 * - Dentro del cuello desliza por el tubo, hacia la boca de abajo (despacio si el reloj está
 *   muy inclinado, pero sin quedarse atascado ni volver atrás).
 * - Fuera del cuello cae libremente hacia donde tira la gravedad, hasta chocar con arena,
 *   con el vidrio o con el cuello.
 * Devuelve la celda donde se posa, o -1 si sigue en el aire.
 */
export function advanceFall(g: FallingGrain, sim: SandSim, angle: number, dt: number): number {
  const { W, H, bottomStart } = sim.hg;
  const gx = Math.sin(angle);
  const gy = Math.cos(angle);
  let fromX = g.x;
  let fromY = g.y;
  let first = 1;

  if (!g.inBulb) {
    g.vy += g.accel * Math.max(gy, 0.15) * dt;
    g.x += (g.lane - g.x) * Math.min(1, dt / 60);
    g.y += g.vy * dt;
    if (g.y < bottomStart) return -1;
    // Sale por la boca del cuello: desde ahí se comprueba el camino, incluida la primera celda.
    g.inBulb = true;
    fromX = g.x;
    fromY = bottomStart + 0.01;
    first = 0;
  } else {
    g.vx += g.accel * gx * dt;
    g.vy += g.accel * gy * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
  }

  const dx = g.x - fromX;
  const dy = g.y - fromY;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.5));
  for (let i = first; i <= steps; i++) {
    const px = fromX + (dx * i) / steps;
    const py = fromY + (dy * i) / steps;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    const hit = cy < bottomStart || cy >= H || cx < 0 || cx >= W || sim.grid[cy * W + cx] !== EMPTY;
    if (!hit) {
      g.lastFree = cy * W + cx;
      continue;
    }
    const at = g.lastFree >= 0 && sim.grid[g.lastFree] === EMPTY ? g.lastFree : sim.findLandingCell();
    if (at >= 0) {
      g.x = (at % W) + 0.5;
      g.y = Math.floor(at / W) + 0.5;
    }
    return at;
  }
  return -1;
}
