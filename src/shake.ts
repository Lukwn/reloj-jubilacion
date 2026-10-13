export interface ShakeImpulse {
  intensity: number; // 0..1
  dir: number; // -1 | 1
}

/** Detecta meneos rápidos del ratón acumulando cambios bruscos de velocidad. */
export class MouseShakeDetector {
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private vx = 0;
  private vy = 0;
  private energy = 0;

  onMove(x: number, y: number, t: number): ShakeImpulse | null {
    const dt = t - this.lastT;
    if (this.lastT === 0 || dt <= 0 || dt > 200) {
      this.lastX = x;
      this.lastY = y;
      this.lastT = t;
      this.vx = this.vy = 0;
      this.energy = 0;
      return null;
    }
    const vx = (x - this.lastX) / dt;
    const vy = (y - this.lastY) / dt;
    const dv = Math.hypot(vx - this.vx, vy - this.vy);
    this.energy = this.energy * Math.exp(-dt / 220) + (Math.hypot(vx, vy) > 0.7 ? dv : 0);
    this.lastX = x;
    this.lastY = y;
    this.lastT = t;
    this.vx = vx;
    this.vy = vy;
    if (this.energy < 2.5) return null;
    return { intensity: Math.min(1, 0.3 + (this.energy - 2.5) / 8), dir: vx >= 0 ? 1 : -1 };
  }
}

/** Convierte un evento devicemotion en impulso de agitación, si es lo bastante brusco. */
export function motionImpulse(e: DeviceMotionEvent, prev: { x: number; y: number; z: number }): ShakeImpulse | null {
  let ax: number;
  let mag: number;
  const a = e.acceleration;
  if (a && a.x !== null && a.y !== null && a.z !== null) {
    ax = a.x;
    mag = Math.hypot(a.x, a.y, a.z);
  } else {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x === null || g.y === null || g.z === null) return null;
    ax = g.x - prev.x;
    mag = Math.hypot(g.x - prev.x, g.y - prev.y, g.z - prev.z);
    prev.x = g.x;
    prev.y = g.y;
    prev.z = g.z;
  }
  if (mag < 9) return null;
  return { intensity: Math.min(1, 0.35 + (mag - 9) / 15), dir: ax >= 0 ? 1 : -1 };
}
