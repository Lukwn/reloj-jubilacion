export interface ShakeImpulse {
  intensity: number; // 0..1
  dir: number; // -1 | 1
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
