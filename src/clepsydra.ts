import { LAYER_TONES } from './colors';
import { civilFromDay, type Life } from './dates';
import { agedBrassGradient, drawStudioShadow, drawStudioSurface, gunmetalGradient, studioPalette } from './studio';

export interface ClepsydraFrame {
  time: number;
  /** Fracción transcurrida de toda la vida laboral (0..1). */
  fraction: number;
  /** Segundos totales ya vividos de la vida laboral. */
  doneSec: number;
  /** Segundos totales de la vida laboral. */
  totalSec: number;
  /** Progreso dentro del segundo actual (0..1) para el ciclo Plateau-Rayleigh de la gota. */
  subSec: number;
  /** 0 = tiempo real (1 gota/s); > 0 = días/s en modo Play. */
  playSpeed: number;
  layersOn: boolean;
  highlightYear: number;
  /** Fracción total alternativa si se previsualiza jubilarse antes (< 1), o -1. */
  cutoffFraction: number;
  reducedMotion: boolean;
}

export type ClepsydraPick =
  | { kind: 'drop' }
  | { kind: 'day'; day: number; past: boolean; year: number };

interface FallingDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Oscilación capilar de Rayleigh (prolato/oblato) tras desprenderse del cuello. */
  osc: number;
  oscV: number;
  /** Edad en ms para retraer suavemente la colita tras el corte del cuello. */
  age: number;
  /** Micro-gota satélite muy sutil que acompaña brevemente al corte del filamento. */
  satellite?: boolean;
}

interface SurfaceRipple {
  x: number;
  rx: number;
  maxRx: number;
  alpha: number;
  chamber: 'top' | 'bot';
}

interface SplashBead {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}

const WAVE_N = 44;
const TOP_RESERVE = 62;
const BOTTOM_RESERVE = 136;

/**
 * Clepsidra horológica de cristal borosilicato (reloj de agua gota a gota) para «Segundos».
 * - Estructura arquitectónica 3D en titanio satinado y oro champán a juego con el reloj de arena.
 * - El agua superior y su extremo inferior forman un único cuerpo líquido continuo cuya interfaz
 *   inferior se simula físicamente (tensión superficial, pandeo hidrostático, cuello Plateau-Rayleigh,
 *   desprendimiento exacto y retroceso elástico), cayendo sobre la cámara inferior con cráter y rebote
 *   integrados en la propia onda del agua.
 */
export class ClepsydraView {
  dpr = 1;
  topExtra = 0;
  /** Callback de sonido «plip» al impactar una gota en el agua. */
  onDrop: ((strength: number) => void) | null = null;

  private ctx: CanvasRenderingContext2D;
  private isLight = false;

  // Geometría del instrumento (en píxeles de dispositivo).
  private cx = 0;
  private topY = 0;
  private waistRingY = 0;
  private lowerRingY = 0;
  private nozzleY = 0;
  private lowerTopY = 0;
  private botY = 0;
  private R = 90;
  private capHalf = 108;
  private capRy = 9;
  private capThick = 12;
  private pillarX = 98;
  private wallPx = 3.5;

  // Tablas de área acumulada para mapear volumen exacto ↔ altura Y.
  private upperCum = new Float32Array(101);
  private lowerCum = new Float32Array(101);

  // Simulación estable de ondas 1D en ambas superficies de agua.
  private topH = new Float32Array(WAVE_N);
  private topV = new Float32Array(WAVE_N);
  private botH = new Float32Array(WAVE_N);
  private botV = new Float32Array(WAVE_N);

  // Simulación física de la interfaz inferior del agua superior (pandeo, cuello y retroceso elástico).
  private tipY = 0;
  private tipVy = 0;
  private neckRatio = 1;
  private neckVel = 0;
  private tipX = 0;
  private tipVx = 0;
  private tipInitialized = false;

  // Movimiento físico del instrumento completo (inclinación con peso, tope elástico y retorno sobre la peana).
  private clockAngle = 0;
  private clockVel = 0;
  private clockX = 0;
  private clockVx = 0;
  private dragAngle0 = 0;
  private dragTiltTarget = 0;
  private isDraggingClock = false;
  private gyroTiltTarget = 0;
  /** Dirección de la gravedad en pantalla (0 en escritorio; sigue al giroscopio en móvil). */
  private worldGravityAngle = 0;

  // Oleaje en coordenadas de mundo para cada cámara (mantienen la horizontal real + inercia al acelerar).
  private topWorldSlosh = 0;
  private topWorldSloshVel = 0;
  private botWorldSlosh = 0;
  private botWorldSloshVel = 0;

  // Gotas en caída libre (en coordenadas de mundo), ondas concéntricas y salpicaduras (en coordenadas locales).
  private drops: FallingDrop[] = [];
  private ripples: SurfaceRipple[] = [];
  private beads: SplashBead[] = [];
  /** Impulso de energía cáustica en el fondo al caer una gota (0..1). */
  private causticPulse = 0;

  private lastTime = 0;
  private lastDoneSec = -1;
  private playDropAccum = 0;
  private lastFraction = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private life: Life,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.buildAreaTables();
    this.refreshTheme();
    this.resize();
  }

  refreshTheme(): void {
    this.isLight = matchMedia('(prefers-color-scheme: light)').matches;
  }

  resize(cssW = window.innerWidth, cssH = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2)): void {
    this.dpr = dpr;
    const W = Math.round(cssW * dpr);
    const H = Math.round(cssH * dpr);
    this.canvas.width = W;
    this.canvas.height = H;

    const top = (TOP_RESERVE + this.topExtra + 18) * dpr;
    const botExtra = cssW < 520 ? 26 : 0;
    const bot = (BOTTOM_RESERVE + 24 + botExtra) * dpr;
    const availH = Math.max(190 * dpr, H - top - bot);
    const availW = Math.max(180 * dpr, (cssW - 36) * dpr);

    const totalH = Math.min(availH, availW * 1.62, 650 * dpr);
    const R = Math.min(availW * 0.36, totalH * 0.255);
    this.cx = W / 2;
    this.R = R;
    this.capHalf = R * 1.24;
    this.pillarX = R * 1.13;
    this.capRy = Math.max(5.5 * dpr, this.capHalf * 0.088);
    this.capThick = Math.max(9.5 * dpr, R * 0.13);
    this.wallPx = Math.max(2.4 * dpr, Math.min(4.6 * dpr, R * 0.044));

    const y0 = top + (availH - totalH) * 0.5;
    this.topY = y0;
    this.nozzleY = y0 + totalH * 0.445;
    this.waistRingY = y0 + totalH * 0.148;
    this.lowerTopY = y0 + totalH * 0.61;
    this.botY = y0 + totalH;
    this.lowerRingY = this.lowerTopY + (this.botY - this.lowerTopY) * 0.24;
    this.tipInitialized = false;
  }

  /**
   * Perfil exterior de la ampolla superior con embudo continuo de curvatura C² hasta la boca abierta:
   * sin codos ni tubo estrecho artificial, para que el agua baje en un volumen continuo y visible.
   */
  private upperProfile(u: number): number {
    if (u < 0.085) {
      const t = u / 0.085;
      return 0.65 + 0.31 * Math.sin(t * Math.PI * 0.5);
    }
    if (u < 0.4) {
      const t = (u - 0.085) / 0.315;
      return 0.96 + 0.04 * Math.sin(t * Math.PI);
    }
    const t = (u - 0.4) / 0.6;
    const s = t * t * t * (t * (t * 6 - 15) + 10);
    return 0.96 * (1 - s) + 0.076 * s;
  }

  /** Perfil exterior del vaso decantador inferior de base gruesa: u=0 boca, u=1 base. */
  private lowerProfile(u: number): number {
    if (u < 0.18) {
      const t = u / 0.18;
      const ease = t * t * (3 - 2 * t);
      return 0.64 + 0.34 * ease;
    }
    if (u < 0.86) {
      const t = (u - 0.18) / 0.68;
      return 0.98 + 0.03 * Math.sin(t * Math.PI);
    }
    const t = (u - 0.86) / 0.14;
    return 0.98 - 0.06 * t * t;
  }

  /** Grosor del vidrio en la ampolla superior (se afina suavemente hacia la boca con tangente vertical en u=1). */
  private upperWall(u: number): number {
    if (u <= 0.58) return this.wallPx;
    const t = (u - 0.58) / 0.42;
    const s = t * t * t * (t * (t * 6 - 15) + 10);
    return Math.max(1.45 * this.dpr, this.wallPx * (1 - 0.5 * s));
  }

  /** Altura de la base sólida de cristal en el fondo del decantador inferior. */
  private lowerBaseGlassH(): number {
    return Math.max(7 * this.dpr, this.R * 0.105);
  }

  /** Precalcula tablas de área acumulada (solo parte interior rellenable de líquido). */
  private buildAreaTables(): void {
    const N = 100;
    let sumU = 0;
    let sumL = 0;
    this.upperCum[0] = 0;
    this.lowerCum[0] = 0;
    for (let i = 1; i <= N; i++) {
      // Volumen útil desde el cuello del embudo (u=0.92) hasta u=0.08.
      const uTop = 0.92 - ((i - 0.5) / N) * 0.84;
      sumU += this.upperProfile(uTop);
      this.upperCum[i] = sumU;

      const uBot = 0.94 - ((i - 0.5) / N) * 0.82;
      sumL += this.lowerProfile(uBot);
      this.lowerCum[i] = sumL;
    }
    for (let i = 1; i <= N; i++) {
      this.upperCum[i] /= sumU;
      this.lowerCum[i] /= sumL;
    }
  }

  private heightFromVol(cum: Float32Array, v: number): number {
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    let lo = 0;
    let hi = 100;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < v) lo = mid;
      else hi = mid;
    }
    const span = cum[hi] - cum[lo] || 1;
    return (lo + (v - cum[lo]) / span) / 100;
  }

  private upperSurfaceY(remVol: number): number {
    const stemStartY = this.topY + (this.nozzleY - this.topY) * 0.94;
    const usableTop = this.topY + (this.nozzleY - this.topY) * 0.1;
    const h = this.heightFromVol(this.upperCum, Math.max(0, Math.min(1, remVol)));
    return stemStartY - h * (stemStartY - usableTop);
  }

  private lowerInnerFloorY(): number {
    return this.botY - this.lowerBaseGlassH();
  }

  private lowerSurfaceY(doneVol: number): number {
    const floor = this.lowerInnerFloorY();
    const usableTop = this.lowerTopY + (floor - this.lowerTopY) * 0.14;
    const visualVol = doneVol <= 0 ? 0 : Math.max(0.06, doneVol);
    const h = this.heightFromVol(this.lowerCum, Math.min(1, visualVol));
    return floor - h * (floor - usableTop);
  }

  private upperInnerHalfAt(y: number): number {
    const u = Math.max(0, Math.min(1, (y - this.topY) / Math.max(1, this.nozzleY - this.topY)));
    return Math.max(2.4 * this.dpr, this.upperProfile(u) * this.R - this.upperWall(u));
  }

  private lowerInnerHalfAt(y: number): number {
    const u = Math.max(0, Math.min(1, (y - this.lowerTopY) / Math.max(1, this.botY - this.lowerTopY)));
    return Math.max(2 * this.dpr, this.lowerProfile(u) * this.R - this.wallPx);
  }

  /** Radio interior real de la boca abierta de la ampolla superior. */
  private boreRadius(): number {
    return this.upperInnerHalfAt(this.nozzleY);
  }

  /** Centro de pivote y ligero encuadre de perspectiva para que el reloj inclinado nunca roce los bordes. */
  private clockPivot(): { baseY: number; worldX: number; worldY: number; scale: number } {
    const baseY = (this.topY + this.botY) * 0.5;
    const lift = Math.abs(Math.sin(this.clockAngle));
    const liftY = -lift * this.capHalf * 0.04;
    const scale = 1 - lift * 0.08;
    return { baseY, worldX: this.cx + this.clockX, worldY: baseY + liftY, scale };
  }

  /** Aplica la transformación rígida del reloj (traslación + giro + encuadre sutil) al contexto de dibujo. */
  private applyClockTransform(ctx: CanvasRenderingContext2D): void {
    const { baseY, worldX, worldY, scale } = this.clockPivot();
    ctx.translate(worldX, worldY);
    ctx.rotate(this.clockAngle);
    ctx.scale(scale, scale);
    ctx.translate(-this.cx, -baseY);
  }

  private localToWorld(lx: number, ly: number): { x: number; y: number } {
    const { baseY, worldX, worldY, scale } = this.clockPivot();
    const dx = (lx - this.cx) * scale;
    const dy = (ly - baseY) * scale;
    const c = Math.cos(this.clockAngle);
    const s = Math.sin(this.clockAngle);
    return { x: worldX + dx * c - dy * s, y: worldY + dx * s + dy * c };
  }

  private worldToLocal(wx: number, wy: number): { x: number; y: number } {
    const { baseY, worldX, worldY, scale } = this.clockPivot();
    const invS = 1 / scale;
    const dx = (wx - worldX) * invS;
    const dy = (wy - worldY) * invS;
    const c = Math.cos(this.clockAngle);
    const s = Math.sin(this.clockAngle);
    return { x: this.cx + dx * c + dy * s, y: baseY - dx * s + dy * c };
  }

  private topLocalSlosh(): number {
    return Math.max(-0.68, Math.min(0.68, this.topWorldSlosh - this.clockAngle));
  }

  private botLocalSlosh(): number {
    return Math.max(-0.68, Math.min(0.68, this.botWorldSlosh - this.clockAngle));
  }

  /** Tope elástico suave (~±33°) para que el vaso abierto se incline con peso natural. */
  private clampClockTilt(rawRad: number): number {
    const soft = 0.44;
    const hard = 0.58;
    const mag = Math.abs(rawRad);
    const clamped = mag <= soft ? mag : soft + (hard - soft) * Math.tanh((mag - soft) / (hard - soft));
    return Math.sign(rawRad) * clamped;
  }

  /** Empieza a coger e inclinar el reloj entero al arrastrar. */
  beginTilt(): void {
    this.isDraggingClock = true;
    this.dragAngle0 = this.clockAngle;
    this.dragTiltTarget = this.clockAngle;
  }

  /** Inclina el reloj completo al arrastrar (dxFromStartCss desde el inicio, dxStepCss del último paso). */
  dragTilt(dxFromStartCss: number, dxStepCss = 0): void {
    if (!this.isDraggingClock) this.beginTilt();
    const raw = this.dragAngle0 + dxFromStartCss * 0.0052;
    this.dragTiltTarget = this.clampClockTilt(raw);
    // Pequeño empuje lateral si se agita rápido de un lado a otro.
    this.clockVx += Math.max(-0.06, Math.min(0.06, dxStepCss * 0.004)) * this.dpr;
    if (Math.abs(dxStepCss) > 3) {
      this.causticPulse = Math.min(1, this.causticPulse + Math.min(0.18, Math.abs(dxStepCss) * 0.01));
    }
  }

  /** Fija un ángulo objetivo explícito en radianes mientras se sujeta el reloj (útil para pruebas/dev). */
  setDragAngle(rad: number): void {
    this.isDraggingClock = true;
    this.dragTiltTarget = this.clampClockTilt(rad);
  }

  /** Suelta el reloj para que vuelva a la vertical con retorno elástico con peso. */
  endTilt(): void {
    this.isDraggingClock = false;
  }

  /** Inclinación externa por giroscopio del móvil (inclina suavemente el reloj y la gravedad real del agua). */
  setTilt(angle: number): void {
    this.worldGravityAngle = Math.max(-0.46, Math.min(0.46, angle * 0.52));
    this.gyroTiltTarget = this.clampClockTilt(angle * 0.24);
  }

  /** Balanceo y sacudida física del reloj entero (doble clic o agitar el móvil); la inercia mueve el agua. */
  tremor(strength = 1): void {
    const s = Math.max(0.3, Math.min(1.5, strength));
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.clockVel += dir * 0.0056 * s;
    this.clockVx += dir * 0.25 * s * this.dpr;
    for (let i = 0; i < WAVE_N; i++) {
      const k = (i / (WAVE_N - 1) - 0.5) * 2;
      this.botV[i] += k * dir * 0.08 * s * this.dpr;
      this.topV[i] -= k * dir * 0.06 * s * this.dpr;
    }
    this.causticPulse = Math.min(1, this.causticPulse + 0.52 * s);
    this.onDrop?.(0.65 * s);
  }

  private impulseWave(v: Float32Array, center: number, strength: number): void {
    for (let k = -4; k <= 4; k++) {
      const i = center + k;
      if (i < 0 || i >= WAVE_N) continue;
      v[i] += strength * Math.exp(-(k * k) / 4.5);
    }
  }

  /** Cráter + corona perimetral directamente en el campo de ondas 1D del agua inferior. */
  private impulseCrater(v: Float32Array, center: number, strength: number): void {
    const kernel: [number, number][] = [
      [0, 1.0],
      [-1, 0.62],
      [1, 0.62],
      [-2, 0.1],
      [2, 0.1],
      [-3, -0.26],
      [3, -0.26],
      [-4, -0.14],
      [4, -0.14],
    ];
    for (const [k, w] of kernel) {
      const i = center + k;
      if (i < 0 || i >= WAVE_N) continue;
      v[i] += strength * w;
    }
  }

  /** Hit-testing preciso teniendo en cuenta la inclinación actual del reloj. */
  pickInfo(cssX: number, cssY: number): ClepsydraPick | null {
    const loc = this.worldToLocal(cssX * this.dpr, cssY * this.dpr);
    const x = loc.x;
    const y = loc.y;
    const totalDays = Math.max(1, this.life.retireDay - this.life.startDay);

    if (Math.abs(x - this.cx) <= this.R * 0.34 && y >= this.nozzleY - 18 * this.dpr && y <= this.lowerTopY + 24 * this.dpr) {
      return { kind: 'drop' };
    }

    const surfTop = this.upperSurfaceY(1 - this.lastFraction);
    if (y >= surfTop - 16 * this.dpr && y <= this.nozzleY && Math.abs(x - this.cx) <= this.upperInnerHalfAt(y) * 1.1) {
      const stemStartY = this.topY + (this.nozzleY - this.topY) * 0.94;
      const fracFromBottom = Math.max(0, Math.min(1, (stemStartY - y) / Math.max(1, stemStartY - surfTop)));
      const dayOffset = Math.floor((this.lastFraction + fracFromBottom * (1 - this.lastFraction)) * (totalDays - 1));
      const day = Math.max(this.life.startDay, Math.min(this.life.retireDay - 1, this.life.startDay + dayOffset));
      return { kind: 'day', day, past: false, year: civilFromDay(day).year };
    }

    const surfBot = this.lowerSurfaceY(this.lastFraction);
    const floor = this.lowerInnerFloorY();
    if (y >= surfBot - 16 * this.dpr && y <= floor && Math.abs(x - this.cx) <= this.lowerInnerHalfAt(y) * 1.1) {
      const fracFromBase = Math.max(0, Math.min(1, (floor - y) / Math.max(1, floor - surfBot)));
      const dayOffset = Math.floor(fracFromBase * this.lastFraction * (totalDays - 1));
      const day = Math.max(this.life.startDay, Math.min(this.life.retireDay - 1, this.life.startDay + dayOffset));
      return { kind: 'day', day, past: true, year: civilFromDay(day).year };
    }

    return null;
  }

  pick(cssX: number, cssY: number): number {
    const info = this.pickInfo(cssX, cssY);
    if (!info) return -1;
    return info.kind === 'drop' ? 0 : info.day - this.life.startDay;
  }

  /** Geometría instantánea del lóbulo colgante (válida cuando tipY > boreR). */
  private pendantBulb(b: number, tipY = this.tipY, neck = this.neckRatio): {
    bulbR: number;
    bulbX: number;
    bulbCY: number;
    waistR: number;
    waistX: number;
    waistY: number;
  } {
    const s = Math.max(0, Math.min(1, (tipY - b) / (2.15 * b)));
    const bulbR = b * (1 - 0.12 * s);
    const bulbCY = this.nozzleY + tipY - bulbR;
    const bulbX = this.cx + this.tipX;
    const waistR = Math.max(0.85 * this.dpr, b * neck);
    const waistY = this.nozzleY + Math.max(0, bulbCY - this.nozzleY) * 0.46;
    const waistX = this.cx + this.tipX * 0.45;
    return { bulbR, bulbX, bulbCY, waistR, waistX, waistY };
  }

  /** Equilibrio hidrostático del extremo inferior del agua (pandeo y estrechamiento del cuello) para fase 0..1. */
  private tipTargets(phase: number, b: number): { y: number; neck: number } {
    const s = Math.max(0, Math.min(1, phase));
    if (s < 0.24) {
      const t = s / 0.24;
      return { y: b * (0.14 + 0.44 * t * t), neck: 1 };
    }
    if (s < 0.64) {
      const t = (s - 0.24) / 0.4;
      const ease = t * t * (3 - 2 * t);
      return { y: b * (0.58 + 0.88 * ease), neck: 1 - 0.18 * ease };
    }
    const t = (s - 0.64) / 0.36;
    const stretch = Math.pow(t, 1.55);
    const pinch = Math.pow(t, 1.48);
    return {
      y: b * (1.46 + 1.66 * stretch),
      neck: 0.82 * (1 - pinch) + 0.12 * pinch,
    };
  }

  /** Desprende la gota en coordenadas reales de mundo (heredando posición, radio y velocidad tangencial). */
  private detachDrop(playMode: boolean): void {
    const b = this.boreRadius();
    const effTipY = Math.max(this.tipY, b * 2.55);
    const { bulbR, bulbX, bulbCY, waistX, waistY } = this.pendantBulb(b, effTipY, Math.min(this.neckRatio, 0.2));
    const initLocalVy = Math.max((playMode ? 0.12 : 0.055) * this.dpr, this.tipVy);
    const initLocalVx = this.tipVx * 0.38;

    const { baseY, scale } = this.clockPivot();
    const c = Math.cos(this.clockAngle);
    const s = Math.sin(this.clockAngle);
    const wPos = this.localToWorld(bulbX, bulbCY);
    // Velocidad tangencial real del punto de la boquilla al girar o sacudirse el reloj.
    const dx = (bulbX - this.cx) * scale;
    const dy = (bulbCY - baseY) * scale;
    const dxW = dx * c - dy * s;
    const dyW = dx * s + dy * c;
    const tangVx = this.clockVx - this.clockVel * dyW;
    const tangVy = this.clockVel * dxW;
    const wVx = tangVx + (initLocalVx * c - initLocalVy * s) * scale;
    const wVy = Math.max(0.03 * this.dpr, tangVy + (initLocalVx * s + initLocalVy * c) * scale);

    this.drops.push({
      x: wPos.x + (playMode ? (Math.random() - 0.5) * 1.1 * this.dpr : 0),
      y: wPos.y,
      vx: wVx,
      vy: wVy,
      r: bulbR * scale,
      osc: 0.26,
      oscV: -0.0055,
      age: 0,
    });

    // Micro-gota satélite muy sutil formada en el punto de rotura del filamento (solo en tiempo real).
    if (!playMode && this.drops.length < 12) {
      const wSat = this.localToWorld(waistX, waistY + bulbR * 0.22);
      this.drops.push({
        x: wSat.x,
        y: wSat.y,
        vx: tangVx * 0.5 + this.tipVx * 0.2 * c * scale,
        vy: Math.max(0.025 * this.dpr, tangVy * 0.5 + 0.028 * this.dpr * c),
        r: bulbR * 0.2 * scale,
        osc: 0.1,
        oscV: 0,
        age: 0,
        satellite: true,
      });
    }

    // Retroceso elástico por tensión superficial del extremo roto hacia arriba (llega a curvarse cóncavo).
    this.tipY = Math.max(b * 0.3, Math.min(this.tipY, waistY - this.nozzleY));
    this.tipVy = -b * (playMode ? 0.0082 : 0.0118);
    this.neckRatio = Math.max(this.neckRatio, 0.72);
    this.neckVel = 0.0045;

    // Pulso capilar ascendente en la superficie superior al romperse el cuello.
    this.impulseWave(this.topV, WAVE_N >> 1, -0.028 * this.dpr);
  }

  /** Integración estable en 4 subpasos con suavizado viscoso: olas suaves y cristalinas. */
  private stepWave(h: Float32Array, v: Float32Array, dt: number): void {
    const subSteps = 4;
    const subDt = dt / subSteps;
    const k = 0.00052;
    const spread = 0.0004;
    const damp = Math.pow(0.955, subDt / 16);
    const maxH = 8.5 * this.dpr;
    for (let s = 0; s < subSteps; s++) {
      for (let i = 0; i < WAVE_N; i++) {
        const left = i > 0 ? h[i - 1] : h[i];
        const right = i < WAVE_N - 1 ? h[i + 1] : h[i];
        const acc = -k * h[i] + spread * (left + right - 2 * h[i]);
        v[i] = (v[i] + acc * subDt) * damp;
      }
      for (let i = 0; i < WAVE_N; i++) {
        h[i] = Math.max(-maxH, Math.min(maxH, h[i] + v[i] * subDt));
      }
    }
    for (let i = 1; i < WAVE_N - 1; i++) {
      h[i] = h[i] * 0.88 + (h[i - 1] + h[i + 1]) * 0.06;
    }
  }

  /** Simula el pandeo, cuello Plateau-Rayleigh, retroceso cóncavo y orientación vertical real del lóbulo colgante. */
  private stepBottomInterface(dt: number, phase: number, active: boolean, nozzleInertialAx: number): void {
    const b = this.boreRadius();
    if (!active) {
      this.tipY *= Math.pow(0.82, dt / 16);
      this.tipVy = 0;
      this.neckRatio = 1;
      this.neckVel = 0;
      this.tipX *= Math.pow(0.85, dt / 16);
      this.tipVx = 0;
      this.tipInitialized = true;
      return;
    }

    const target = this.tipTargets(phase, b);
    if (!this.tipInitialized) {
      this.tipY = target.y;
      this.tipVy = 0;
      this.neckRatio = target.neck;
      this.neckVel = 0;
      this.tipX = 0;
      this.tipVx = 0;
      this.tipInitialized = true;
      return;
    }

    const subSteps = 4;
    const subDt = dt / subSteps;
    const kTip = phase > 0.72 ? 0.00095 : 0.00055;
    const dampTip = Math.pow(0.84, subDt / 16);
    const kNeck = 0.00095;
    const dampNeck = Math.pow(0.82, subDt / 16);
    const kX = 0.00088;
    const dampX = Math.pow(0.86, subDt / 16);
    // Dirección de la gravedad real en coordenadas locales del reloj: apunta siempre hacia abajo en pantalla.
    const relG = this.clockAngle - this.worldGravityAngle;
    const sloshBias = Math.sin(this.topWorldSlosh - this.worldGravityAngle) * 0.22;

    for (let s = 0; s < subSteps; s++) {
      const tipAcc = (target.y - this.tipY) * kTip;
      this.tipVy = (this.tipVy + tipAcc * subDt) * dampTip;
      this.tipY = Math.max(-b * 0.28, Math.min(b * 3.3, this.tipY + this.tipVy * subDt));

      const neckAcc = (target.neck - this.neckRatio) * kNeck;
      this.neckVel = (this.neckVel + neckAcc * subDt) * dampNeck;
      this.neckRatio = Math.max(0.11, Math.min(1, this.neckRatio + this.neckVel * subDt));

      const maxSide = Math.min(b * 1.15, Math.max(b * 0.16, Math.abs(this.tipY) * 0.62));
      const targetX = (Math.sin(relG) * 0.72 + sloshBias) * Math.max(0, this.tipY);
      const xAcc = (targetX - this.tipX) * kX - nozzleInertialAx * 0.25;
      this.tipVx = (this.tipVx + xAcc * subDt) * dampX;
      this.tipX = Math.max(-maxSide, Math.min(maxSide, this.tipX + this.tipVx * subDt));
    }
  }

  private stepPhysics(dt: number, f: ClepsydraFrame): void {
    // 1. Dinámica rígida del instrumento completo (giro con peso + retorno elástico) acoplada al oleaje real del agua.
    const subSteps = 4;
    const subDt = dt / subSteps;
    const targetAngle = this.isDraggingClock ? this.dragTiltTarget : this.gyroTiltTarget;
    const kClock = this.isDraggingClock ? 0.0036 : 0.00046;
    const dampClock = Math.pow(this.isDraggingClock ? 0.72 : 0.875, subDt / 16);
    const kShift = 0.0014;
    const dampShift = Math.pow(0.82, subDt / 16);

    const basePivotY = (this.topY + this.botY) * 0.5;
    const dyUpper = this.topY + (this.nozzleY - this.topY) * 0.35 - basePivotY; // < 0 (encima del pivote)
    const dyLower = this.lowerTopY + (this.botY - this.lowerTopY) * 0.72 - basePivotY; // > 0 (debajo del pivote)
    const dyNozzle = this.nozzleY - basePivotY;
    const invR = 1 / Math.max(20, this.R);

    const kTopSlosh = 0.00044;
    const dampTopSlosh = Math.pow(0.945, subDt / 16);
    const kBotSlosh = 0.00052;
    const dampBotSlosh = Math.pow(0.94, subDt / 16);

    let lastNozzleAx = 0;
    let waveKickTop = 0;
    let waveKickBot = 0;

    for (let s = 0; s < subSteps; s++) {
      const clockAcc = (targetAngle - this.clockAngle) * kClock;
      this.clockVel = (this.clockVel + clockAcc * subDt) * dampClock;
      this.clockAngle = Math.max(-0.62, Math.min(0.62, this.clockAngle + this.clockVel * subDt));

      const clockAx = -this.clockX * kShift;
      this.clockVx = (this.clockVx + clockAx * subDt) * dampShift;
      this.clockX = Math.max(-16 * this.dpr, Math.min(16 * this.dpr, this.clockX + this.clockVx * subDt));

      // Aceleración horizontal real de cada cámara debido al giro + sacudida del reloj.
      const aUpper = (clockAx - dyUpper * clockAcc) * invR;
      const aLower = (clockAx - dyLower * clockAcc) * invR;
      lastNozzleAx = clockAx - dyNozzle * clockAcc;

      // El agua en coordenadas de mundo busca quedarse horizontal (worldGravityAngle) + chapoteo por inercia.
      const topAcc = (this.worldGravityAngle - this.topWorldSlosh) * kTopSlosh + aUpper * 0.13;
      this.topWorldSloshVel = (this.topWorldSloshVel + topAcc * subDt) * dampTopSlosh;
      this.topWorldSlosh = Math.max(-0.55, Math.min(0.55, this.topWorldSlosh + this.topWorldSloshVel * subDt));

      const botAcc = (this.worldGravityAngle - this.botWorldSlosh) * kBotSlosh + aLower * 0.11;
      this.botWorldSloshVel = (this.botWorldSloshVel + botAcc * subDt) * dampBotSlosh;
      this.botWorldSlosh = Math.max(-0.55, Math.min(0.55, this.botWorldSlosh + this.botWorldSloshVel * subDt));

      waveKickTop += aUpper * subDt;
      waveKickBot += aLower * subDt;
    }

    // Ondas superficiales 1D excitadas suavemente por la aceleración real del reloj.
    if (Math.abs(waveKickTop) > 0.00004 || Math.abs(waveKickBot) > 0.00004) {
      const kTop = Math.max(-0.08, Math.min(0.08, waveKickTop * 2.1)) * this.dpr;
      const kBot = Math.max(-0.09, Math.min(0.09, waveKickBot * 2.2)) * this.dpr;
      for (let i = 0; i < WAVE_N; i++) {
        const u = (i / (WAVE_N - 1) - 0.5) * 2;
        this.topV[i] += u * kTop;
        this.botV[i] += u * kBot;
      }
      this.causticPulse = Math.min(1, this.causticPulse + Math.min(0.08, Math.abs(waveKickBot) * 2.5));
    }

    // 2. Ondas 1D en ambas superficies.
    this.stepWave(this.topH, this.topV, dt);
    this.stepWave(this.botH, this.botV, dt);

    // 3. Simulación del fondo del agua superior y desprendimiento sincronizado al segundo real (o modo Play).
    if (f.fraction < 1) {
      if (f.playSpeed > 0) {
        const rate = Math.min(11, Math.max(2.4, 2.2 + Math.log10(f.playSpeed + 1) * 3.1));
        this.playDropAccum += (dt / 1000) * rate;
        while (this.playDropAccum >= 1) {
          this.playDropAccum -= 1;
          if (this.drops.length < 16) this.detachDrop(true);
        }
        this.stepBottomInterface(dt, this.playDropAccum, true, lastNozzleAx);
      } else {
        if (this.lastDoneSec >= 0 && f.doneSec > this.lastDoneSec) {
          this.detachDrop(false);
        }
        this.stepBottomInterface(dt, f.subSec, true, lastNozzleAx);
      }
    } else {
      this.stepBottomInterface(dt, 0, false, 0);
    }
    this.lastDoneSec = f.doneSec;

    // 4. Gravedad vertical REAL en coordenadas de mundo, deslizamiento por vidrio interior e impacto en el agua.
    const g = 0.0022 * this.dpr;
    const gxW = Math.sin(this.worldGravityAngle) * g;
    const gyW = Math.cos(this.worldGravityAngle) * g;
    const surfBot = this.lowerSurfaceY(f.fraction);
    const floorY = this.lowerInnerFloorY();
    const botSlosh = this.botLocalSlosh();
    const tanBot = Math.tan(botSlosh);
    const spanX = this.R * 1.12;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vx = (d.vx + gxW * dt) * Math.pow(0.985, dt / 16);
      d.vy += gyW * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.age += dt;

      // Oscilación capilar de Rayleigh (alargada → esférica → ligeramente achatada → esférica).
      const oscAcc = -0.0012 * d.osc;
      d.oscV = (d.oscV + oscAcc * dt) * Math.pow(0.86, dt / 16);
      d.osc = Math.max(-0.22, Math.min(0.35, d.osc + d.oscV * dt));

      const loc = this.worldToLocal(d.x, d.y);

      // Si el reloj está inclinado y la gota roza la pared interior del vaso inferior, desliza por el cristal.
      if (loc.y >= this.lowerTopY + 2 * this.dpr && loc.y <= floorY) {
        const wallR = Math.max(4 * this.dpr, this.lowerInnerHalfAt(loc.y) - d.r * 0.85);
        const off = loc.x - this.cx;
        if (Math.abs(off) > wallR && Math.abs(off) < wallR + 28 * this.dpr) {
          const clampedLx = this.cx + Math.sign(off) * wallR;
          const clampedW = this.localToWorld(clampedLx, loc.y);
          d.x = clampedW.x;
          d.y = clampedW.y;
          d.vy *= Math.pow(0.92, dt / 16);
          d.vx *= Math.pow(0.82, dt / 16);
          loc.x = clampedLx;
        }
      }

      const surfAtX = surfBot + (loc.x - this.cx) * tanBot;
      const hitY = Math.min(floorY - d.r * 0.45, surfAtX);
      const insideLower = Math.abs(loc.x - this.cx) <= this.lowerInnerHalfAt(Math.min(floorY, Math.max(this.lowerTopY, loc.y))) + 4 * this.dpr;

      if (loc.y >= hitY && insideLower) {
        this.drops.splice(i, 1);
        if (d.satellite) continue;

        const hw = Math.max(16 * this.dpr, this.lowerInnerHalfAt(Math.max(this.lowerTopY, Math.min(floorY, hitY))));
        const cIdx = Math.max(
          2,
          Math.min(WAVE_N - 3, Math.round(((loc.x - (this.cx - spanX)) / (2 * spanX)) * (WAVE_N - 1))),
        );
        // Cráter + rebote líquido en el punto exacto donde cae la gota (descentrado si el reloj está inclinado).
        this.impulseCrater(this.botV, cIdx, (f.playSpeed > 0 ? 0.24 : 0.34) * this.dpr);
        this.causticPulse = Math.min(1, this.causticPulse + 0.65);

        // Onda superficial 3D expansiva sobre el punto exacto de impacto.
        this.ripples.push({
          x: loc.x,
          rx: d.r * 1.05,
          maxRx: Math.min(hw * 0.86, 62 * this.dpr),
          alpha: 0.78,
          chamber: 'bot',
        });

        // Micro-gotitas de salpicadura en coordenadas locales, saliendo perpendiculares a la superficie inclinada.
        const count = f.playSpeed > 0 ? 1 : 2;
        for (let k = 0; k < count && this.beads.length < 18; k++) {
          const side = k === 0 ? -1 : 1;
          const ang = -Math.PI * 0.5 + botSlosh + side * (0.35 + Math.random() * 0.32);
          const spd = (0.07 + Math.random() * 0.075) * this.dpr;
          this.beads.push({
            x: loc.x + side * d.r * 0.45,
            y: hitY - 1.2 * this.dpr,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            r: (0.85 + Math.random() * 0.65) * this.dpr,
            life: 1,
          });
        }
        this.onDrop?.(f.playSpeed > 0 ? 0.42 : 0.85);
      } else if (d.y > this.canvas.height + 40 * this.dpr || loc.y > this.botY + 60 * this.dpr) {
        this.drops.splice(i, 1);
      }
    }

    // 5. Ondas concéntricas superficiales.
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.rx += 0.068 * this.dpr * dt;
      r.alpha *= Math.pow(0.925, dt / 16);
      if (r.rx >= r.maxRx || r.alpha < 0.03) this.ripples.splice(i, 1);
    }

    // 6. Micro-gotitas de salpicadura (coordenadas locales del vaso con gravedad real rotada).
    const relG = this.clockAngle - this.worldGravityAngle;
    const gBeadX = 0.0014 * this.dpr * Math.sin(relG);
    const gBeadY = 0.0014 * this.dpr * Math.cos(relG);
    for (let i = this.beads.length - 1; i >= 0; i--) {
      const b = this.beads[i];
      b.vx += gBeadX * dt;
      b.vy += gBeadY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt / 300;
      const surfAtB = surfBot + (b.x - this.cx) * tanBot;
      if (b.life <= 0 || b.y > Math.min(floorY, surfAtB) + 3 * this.dpr) this.beads.splice(i, 1);
    }

    this.causticPulse *= Math.pow(0.93, dt / 16);
  }

  /**
   * Contorno único y continuo del cuerpo de agua superior: paredes interiores de la ampolla +
   * embudo + interfaz inferior simulada (menisco cóncavo de retroceso, pandeo convexo o cuello catenoide + lóbulo).
   * Garantiza continuidad geométrica C¹ y un único sombreado sin costura en la boquilla.
   */
  private traceUpperFluidPath(ctx: CanvasRenderingContext2D, includeBottom: boolean): void {
    const steps = 52;
    const h = this.nozzleY - this.topY;
    const b = this.boreRadius();
    const y0 = this.nozzleY;

    ctx.beginPath();
    // Pared interior derecha de arriba hasta el labio derecho de la boquilla (tangente vertical en u=1).
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const y = this.topY + u * h;
      const hw = Math.max(2.4 * this.dpr, this.upperProfile(u) * this.R - this.upperWall(u));
      const x = this.cx + hw;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Interfaz inferior simulada del agua (continua desde (cx + b, y0) hasta (cx - b, y0)).
    if (includeBottom) {
      if (this.tipY <= b) {
        if (this.tipY <= 0) {
          // Retroceso cóncavo por tensión superficial ligeramente dentro de la boquilla.
          const cX = b * 0.62;
          const cy = y0 + this.tipY * 1.333;
          ctx.bezierCurveTo(
            this.cx + cX + this.tipX * 0.3,
            cy,
            this.cx - cX + this.tipX * 0.3,
            cy,
            this.cx - b,
            y0,
          );
        } else {
          // Menisco convexo hinchándose suavemente hasta formar una semiesfera tangente al vidrio.
          const p = this.tipY / b;
          const cX = b * (0.64 + 0.36 * p);
          const cy = y0 + this.tipY * 1.333;
          ctx.bezierCurveTo(
            this.cx + cX + this.tipX * 0.4,
            cy,
            this.cx - cX + this.tipX * 0.4,
            cy,
            this.cx - b,
            y0,
          );
        }
      } else {
        // Pandeo colgante + estrechamiento catenoide Plateau-Rayleigh + lóbulo inferior continuo.
        const { bulbR, bulbX, bulbCY, waistR, waistX, waistY } = this.pendantBulb(b);
        ctx.bezierCurveTo(
          this.cx + b,
          y0 + (waistY - y0) * 0.45,
          waistX + waistR,
          waistY - (waistY - y0) * 0.45,
          waistX + waistR,
          waistY,
        );
        ctx.bezierCurveTo(
          waistX + waistR,
          waistY + (bulbCY - waistY) * 0.48,
          bulbX + bulbR,
          bulbCY - (bulbCY - waistY) * 0.48,
          bulbX + bulbR,
          bulbCY,
        );
        ctx.arc(bulbX, bulbCY, bulbR, 0, Math.PI, false);
        ctx.bezierCurveTo(
          bulbX - bulbR,
          bulbCY - (bulbCY - waistY) * 0.48,
          waistX - waistR,
          waistY + (bulbCY - waistY) * 0.48,
          waistX - waistR,
          waistY,
        );
        ctx.bezierCurveTo(
          waistX - waistR,
          waistY - (waistY - y0) * 0.45,
          this.cx - b,
          y0 + (waistY - y0) * 0.45,
          this.cx - b,
          y0,
        );
      }
    } else {
      ctx.lineTo(this.cx - b, y0);
    }

    // Pared interior izquierda de regreso desde la boquilla hasta arriba.
    for (let i = steps - 1; i >= 0; i--) {
      const u = i / steps;
      const y = this.topY + u * h;
      const hw = Math.max(2.4 * this.dpr, this.upperProfile(u) * this.R - this.upperWall(u));
      ctx.lineTo(this.cx - hw, y);
    }
    ctx.closePath();
  }

  /** Contorno del vaso inferior (exterior completo o cavidad interior sobre la base sólida de cristal). */
  private traceLowerPath(ctx: CanvasRenderingContext2D, inner: boolean): void {
    const steps = 44;
    const yEnd = inner ? this.lowerInnerFloorY() : this.botY;
    const h = yEnd - this.lowerTopY;
    const fullH = this.botY - this.lowerTopY;
    const inset = inner ? this.wallPx : 0;
    const endRx = Math.max(4 * this.dpr, this.lowerProfile((yEnd - this.lowerTopY) / fullH) * this.R - inset);
    const endRy = Math.max(3 * this.dpr, endRx * 0.08);

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const y = this.lowerTopY + (i / steps) * h;
      const u = (y - this.lowerTopY) / fullH;
      const hw = Math.max(3 * this.dpr, this.lowerProfile(u) * this.R - inset);
      const x = this.cx + hw;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.ellipse(this.cx, yEnd, endRx, endRy, 0, 0, Math.PI, false);
    for (let i = steps; i >= 0; i--) {
      const y = this.lowerTopY + (i / steps) * h;
      const u = (y - this.lowerTopY) / fullH;
      const hw = Math.max(3 * this.dpr, this.lowerProfile(u) * this.R - inset);
      ctx.lineTo(this.cx - hw, y);
    }
    ctx.closePath();
  }

  /**
   * Dibuja un volumen de agua mineral unificado con absorción óptica Beer-Lambert,
   * refracción interna continua, menisco 3D sincronizado con las ondas y cáusticas.
   */
  private drawLiquid(
    ctx: CanvasRenderingContext2D,
    surfY: number,
    bottomY: number,
    waveH: Float32Array,
    halfAt: (y: number) => number,
    f: ClepsydraFrame,
    isUpper: boolean,
    localSlosh: number,
  ): void {
    if (surfY >= bottomY - 0.5) return;
    const hw = Math.max(5 * this.dpr, halfAt(surfY));
    const spanX = this.R * 1.12;
    const tanSlosh = Math.tan(localSlosh);
    const hwArch = Math.max(hw, halfAt(surfY - hw * tanSlosh), halfAt(surfY + hw * tanSlosh));
    const xAt = (i: number) => this.cx - spanX + (i / (WAVE_N - 1)) * 2 * spanX;
    const surfaceYAt = (i: number) => surfY + (xAt(i) - this.cx) * tanSlosh + waveH[i];
    const menRy = Math.max(3.4 * this.dpr, Math.min(9.5 * this.dpr, hw * 0.1));

    // 1. Cuerpo principal único del agua (en cámara superior cubre hasta el ápice de la gota colgante).
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xAt(0), surfaceYAt(0));
    for (let i = 1; i < WAVE_N - 1; i++) {
      const xc = xAt(i);
      const yc = surfaceYAt(i);
      ctx.quadraticCurveTo(xc, yc, (xc + xAt(i + 1)) * 0.5, (yc + surfaceYAt(i + 1)) * 0.5);
    }
    ctx.lineTo(xAt(WAVE_N - 1), surfaceYAt(WAVE_N - 1));
    ctx.lineTo(this.cx + spanX, bottomY + 26 * this.dpr);
    ctx.lineTo(this.cx - spanX, bottomY + 26 * this.dpr);
    ctx.closePath();

    const liqGrad = ctx.createLinearGradient(this.cx, surfY, this.cx, bottomY);
    if (isUpper) {
      // Agua cristalina transparente: deja ver el estudio oscuro a través del cuerpo y brilla por refracción.
      if (this.isLight) {
        liqGrad.addColorStop(0, 'rgba(182, 198, 206, 0.16)');
        liqGrad.addColorStop(0.45, 'rgba(148, 168, 178, 0.22)');
        liqGrad.addColorStop(0.82, 'rgba(128, 150, 162, 0.3)');
        liqGrad.addColorStop(1, 'rgba(104, 128, 140, 0.38)');
      } else {
        liqGrad.addColorStop(0, 'rgba(195, 212, 220, 0.08)');
        liqGrad.addColorStop(0.35, 'rgba(146, 168, 178, 0.11)');
        liqGrad.addColorStop(0.76, 'rgba(138, 162, 174, 0.18)');
        liqGrad.addColorStop(1, 'rgba(164, 188, 200, 0.28)');
      }
    } else if (this.isLight) {
      liqGrad.addColorStop(0, 'rgba(176, 194, 202, 0.16)');
      liqGrad.addColorStop(0.5, 'rgba(136, 156, 166, 0.24)');
      liqGrad.addColorStop(1, 'rgba(98, 118, 130, 0.34)');
    } else {
      liqGrad.addColorStop(0, 'rgba(195, 212, 220, 0.09)');
      liqGrad.addColorStop(0.48, 'rgba(138, 160, 172, 0.13)');
      liqGrad.addColorStop(1, 'rgba(96, 118, 130, 0.22)');
    }
    ctx.fillStyle = liqGrad;
    ctx.fill();

    ctx.clip();

    // Banda óptica oscura justo bajo el menisco (reflexión interna del techo del estudio en agua transparente).
    const underMen = ctx.createLinearGradient(0, surfY, 0, surfY + Math.max(14 * this.dpr, (bottomY - surfY) * 0.22));
    underMen.addColorStop(0, this.isLight ? 'rgba(32, 42, 48, 0.14)' : 'rgba(4, 6, 8, 0.55)');
    underMen.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = underMen;
    ctx.fillRect(this.cx - spanX, surfY, spanX * 2, Math.max(16 * this.dpr, (bottomY - surfY) * 0.24));

    // Iluminación interna de refracción (key light desde arriba-izquierda atravesando el agua transparente).
    const refr = ctx.createRadialGradient(
      this.cx - hw * 0.32,
      isUpper ? surfY + (bottomY - surfY) * 0.38 : surfY + (bottomY - surfY) * 0.36,
      hw * 0.05,
      this.cx,
      (surfY + bottomY) * 0.5,
      this.R * 0.98,
    );
    refr.addColorStop(0, this.isLight ? 'rgba(255, 255, 255, 0.48)' : 'rgba(240, 246, 250, 0.16)');
    refr.addColorStop(0.45, 'rgba(220, 228, 232, 0.04)');
    refr.addColorStop(1, isUpper ? 'rgba(6, 8, 10, 0.24)' : 'rgba(4, 6, 8, 0.42)');
    ctx.fillStyle = refr;
    ctx.fillRect(this.cx - spanX, surfY - 20 * this.dpr, spanX * 2, bottomY - surfY + 34 * this.dpr);

    // Cáustica y brillo interno progresivos en el lóbulo colgante (100 % integrados dentro del mismo clip).
    if (isUpper && f.fraction < 1) {
      const b = this.boreRadius();
      const lobeT = Math.max(0, Math.min(1, (this.tipY / b - 0.3) / 1.45));
      if (lobeT > 0.01) {
        const { bulbR, bulbX, bulbCY } =
          this.tipY > b
            ? this.pendantBulb(b)
            : { bulbR: b * 0.92, bulbX: this.cx + this.tipX * 0.4, bulbCY: this.nozzleY + this.tipY * 0.42 };

        // Lente cáustica óptica clara en el hemisferio inferior del pandeo.
        const cg = ctx.createRadialGradient(
          bulbX + bulbR * 0.08,
          bulbCY + bulbR * 0.38,
          bulbR * 0.04,
          bulbX,
          bulbCY + bulbR * 0.25,
          bulbR * 1.15,
        );
        cg.addColorStop(0, `rgba(246, 250, 252, ${0.62 * lobeT})`);
        cg.addColorStop(0.5, `rgba(210, 222, 228, ${0.22 * lobeT})`);
        cg.addColorStop(1, 'rgba(160, 175, 184, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(bulbX, bulbCY + bulbR * 0.2, bulbR * 1.25, 0, Math.PI * 2);
        ctx.fill();

        // Suave reflejo especular arriba-izquierda (luz clave de estudio).
        const sg = ctx.createRadialGradient(
          bulbX - bulbR * 0.34,
          bulbCY - bulbR * 0.16,
          0,
          bulbX - bulbR * 0.34,
          bulbCY - bulbR * 0.16,
          bulbR * 0.46,
        );
        sg.addColorStop(0, `rgba(255, 255, 255, ${0.58 * lobeT})`);
        sg.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(bulbX - bulbR * 0.34, bulbCY - bulbR * 0.16, bulbR * 0.46, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Cáusticas ópticas neutras bailando suavemente en el fondo del decantador inferior.
    if (!isUpper) {
      const t = f.time * 0.0014;
      const boost = 0.22 + this.causticPulse * 0.32;
      ctx.save();
      for (let k = -2; k <= 2; k++) {
        const cxOff = Math.sin(t * (1.1 + k * 0.17) + k * 1.6) * hw * 0.35 + k * hw * 0.22;
        const crx = hw * (0.22 + 0.06 * Math.cos(t + k));
        const cry = Math.max(3 * this.dpr, (bottomY - surfY) * 0.14);
        const cg = ctx.createRadialGradient(this.cx + cxOff, bottomY - 2 * this.dpr, 0, this.cx + cxOff, bottomY - 2 * this.dpr, crx);
        cg.addColorStop(0, `rgba(242, 246, 248, ${boost})`);
        cg.addColorStop(0.55, `rgba(218, 206, 184, ${boost * 0.35})`);
        cg.addColorStop(1, 'rgba(200, 210, 216, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(this.cx + cxOff, bottomY - 2 * this.dpr, crx, cry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Capas por años (bandas horizontales translúcidas).
    if (f.layersOn) {
      const startYear = civilFromDay(this.life.startDay).year;
      const endYear = civilFromDay(this.life.retireDay - 1).year;
      const totalYears = Math.max(1, endYear - startYear + 1);
      const effBot = isUpper ? this.topY + (this.nozzleY - this.topY) * 0.94 : bottomY;
      for (let yIdx = 0; yIdx < totalYears; yIdx++) {
        const yr = startYear + yIdx;
        const frac0 = yIdx / totalYears;
        const frac1 = (yIdx + 1) / totalYears;
        if (isUpper) {
          if (frac1 <= f.fraction) continue;
          const a = Math.max(0, (Math.max(frac0, f.fraction) - f.fraction) / Math.max(0.0001, 1 - f.fraction));
          const b = Math.min(1, (frac1 - f.fraction) / Math.max(0.0001, 1 - f.fraction));
          const yBotBand = effBot - a * (effBot - surfY);
          const yTopBand = effBot - b * (effBot - surfY);
          const [h0, s0, l0] = LAYER_TONES[yr % LAYER_TONES.length];
          const hi = f.highlightYear >= 0 ? (yr === f.highlightYear ? 0.65 : 0.14) : 0.36;
          ctx.fillStyle = `hsla(${h0}, ${Math.round(s0 * 100)}%, ${Math.round(l0 * 100)}%, ${hi})`;
          ctx.fillRect(this.cx - spanX, yTopBand, spanX * 2, Math.max(1, yBotBand - yTopBand));
        } else {
          if (frac0 >= f.fraction) continue;
          const a = frac0 / Math.max(0.0001, f.fraction);
          const b = Math.min(1, frac1 / Math.max(0.0001, f.fraction));
          const yBotBand = bottomY - a * (bottomY - surfY);
          const yTopBand = bottomY - b * (bottomY - surfY);
          const [h0, s0, l0] = LAYER_TONES[yr % LAYER_TONES.length];
          const hi = f.highlightYear >= 0 ? (yr === f.highlightYear ? 0.65 : 0.14) : 0.36;
          ctx.fillStyle = `hsla(${h0}, ${Math.round(s0 * 100)}%, ${Math.round(l0 * 100)}%, ${hi})`;
          ctx.fillRect(this.cx - spanX, yTopBand, spanX * 2, Math.max(1, yBotBand - yTopBand));
        }
      }
    }

    // Corte de edad alternativa en la cámara superior.
    if (isUpper && f.cutoffFraction >= 0 && f.cutoffFraction < 1 && f.cutoffFraction > f.fraction) {
      const cutVol = Math.max(0, f.cutoffFraction - f.fraction);
      const cutY = this.upperSurfaceY(cutVol);
      if (cutY > surfY && cutY < this.nozzleY) {
        ctx.fillStyle = this.isLight ? 'rgba(243, 245, 248, 0.56)' : 'rgba(10, 14, 22, 0.56)';
        ctx.fillRect(this.cx - spanX, surfY - 14 * this.dpr, spanX * 2, cutY - surfY + 14 * this.dpr);
        ctx.strokeStyle = 'rgba(245, 212, 130, 0.9)';
        ctx.lineWidth = 1.4 * this.dpr;
        ctx.setLineDash([5 * this.dpr, 4 * this.dpr]);
        ctx.beginPath();
        ctx.moveTo(this.cx - spanX, cutY);
        ctx.lineTo(this.cx + spanX, cutY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Refracción cilíndrica lateral junto al vidrio (reflexión interna total nítida en agua cristalina).
    const sideShade = ctx.createLinearGradient(this.cx - hw, 0, this.cx + hw, 0);
    sideShade.addColorStop(0, 'rgba(236, 244, 248, 0.38)');
    sideShade.addColorStop(0.055, 'rgba(6, 8, 10, 0.54)');
    sideShade.addColorStop(0.14, 'rgba(236, 244, 248, 0.2)');
    sideShade.addColorStop(0.32, 'rgba(255, 255, 255, 0)');
    sideShade.addColorStop(0.76, 'rgba(255, 255, 255, 0)');
    sideShade.addColorStop(0.88, 'rgba(224, 216, 200, 0.13)');
    sideShade.addColorStop(0.95, 'rgba(6, 8, 10, 0.56)');
    sideShade.addColorStop(1, 'rgba(228, 236, 240, 0.28)');
    ctx.fillStyle = sideShade;
    ctx.fillRect(this.cx - spanX, surfY - 18 * this.dpr, spanX * 2, bottomY - surfY + 30 * this.dpr);
    ctx.restore();

    // 2. Superficie superior elíptica 3D del agua (cara superior refractiva + borde de menisco curvo).
    ctx.save();
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < WAVE_N; i++) {
      const x = xAt(i);
      const nx = (x - this.cx) / hwArch;
      if (Math.abs(nx) > 1.03) continue;
      const arch = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx))) * menRy;
      const y = surfaceYAt(i) - arch;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    for (let i = WAVE_N - 1; i >= 0; i--) {
      const x = xAt(i);
      const nx = (x - this.cx) / hwArch;
      if (Math.abs(nx) > 1.03) continue;
      const arch = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx))) * menRy;
      const y = surfaceYAt(i) + arch;
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    const topSurfGrad = ctx.createLinearGradient(this.cx - hwArch, surfY - menRy, this.cx + hwArch, surfY + menRy);
    topSurfGrad.addColorStop(0, 'rgba(186, 198, 204, 0.22)');
    topSurfGrad.addColorStop(0.28, 'rgba(244, 248, 250, 0.44)');
    topSurfGrad.addColorStop(0.56, 'rgba(216, 212, 202, 0.22)');
    topSurfGrad.addColorStop(0.84, 'rgba(176, 188, 196, 0.2)');
    topSurfGrad.addColorStop(1, 'rgba(130, 142, 150, 0.16)');
    ctx.fillStyle = topSurfGrad;
    ctx.fill();

    // Filo delantero nítido del menisco pegado a la pared interior del vidrio.
    ctx.beginPath();
    started = false;
    for (let i = 0; i < WAVE_N; i++) {
      const x = xAt(i);
      const nx = (x - this.cx) / hwArch;
      if (Math.abs(nx) > 1.02) continue;
      const arch = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx))) * menRy;
      const y = surfaceYAt(i) + arch;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else if (i < WAVE_N - 1 && Math.abs((xAt(i + 1) - this.cx) / hwArch) <= 1.02) {
        const nx2 = (xAt(i + 1) - this.cx) / hwArch;
        const arch2 = Math.sqrt(Math.max(0, 1 - Math.min(1, nx2 * nx2))) * menRy;
        ctx.quadraticCurveTo(x, y, (x + xAt(i + 1)) * 0.5, (y + surfaceYAt(i + 1) + arch2) * 0.5);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = this.isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(242, 246, 250, 0.78)';
    ctx.lineWidth = Math.max(1.25, 1.5 * this.dpr);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Gota de agua óptica transparente en estudio oscuro:
   * cuerpo refractivo casi incoloro, lente cáustica inferior y destello softbox arriba-izquierda.
   */
  private fillWaterDrop(ctx: CanvasRenderingContext2D, x: number, cy: number, r: number, topY: number): void {
    const bodyGrad = ctx.createLinearGradient(x - r * 0.25, topY, x + r * 0.3, cy + r);
    if (this.isLight) {
      bodyGrad.addColorStop(0, 'rgba(182, 196, 204, 0.42)');
      bodyGrad.addColorStop(0.55, 'rgba(142, 160, 170, 0.48)');
      bodyGrad.addColorStop(1, 'rgba(104, 122, 134, 0.58)');
    } else {
      bodyGrad.addColorStop(0, 'rgba(196, 210, 218, 0.32)');
      bodyGrad.addColorStop(0.55, 'rgba(136, 154, 164, 0.42)');
      bodyGrad.addColorStop(1, 'rgba(82, 100, 112, 0.54)');
    }
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    ctx.save();
    ctx.clip();

    // Lente cáustica brillante en el hemisferio inferior (efecto óptico real de gota de agua).
    const caustic = ctx.createRadialGradient(x + r * 0.08, cy + r * 0.38, r * 0.04, x, cy + r * 0.24, r * 1.1);
    caustic.addColorStop(0, 'rgba(248, 252, 255, 0.78)');
    caustic.addColorStop(0.45, 'rgba(216, 228, 234, 0.32)');
    caustic.addColorStop(1, 'rgba(140, 158, 168, 0)');
    ctx.fillStyle = caustic;
    ctx.beginPath();
    ctx.arc(x, cy + r * 0.2, r * 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Reflejo especular de softbox arriba-izquierda.
    const spec = ctx.createRadialGradient(x - r * 0.34, cy - r * 0.16, 0, x - r * 0.34, cy - r * 0.16, r * 0.44);
    spec.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(x - r * 0.34, cy - r * 0.16, r * 0.44, 0, Math.PI * 2);
    ctx.fill();

    // Contorno refractivo fino (reflexión interna en el borde de la gota).
    ctx.strokeStyle = this.isLight ? 'rgba(60, 74, 84, 0.34)' : 'rgba(232, 240, 246, 0.44)';
    ctx.lineWidth = Math.max(0.9, 1.1 * this.dpr);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Gota desprendida en caída libre: nace con la colita suave del cuello roto, la retrae en ~115 ms
   * por tensión superficial y vibra con oscilación capilar real de Rayleigh mientras cae.
   */
  private drawFallingDrop(ctx: CanvasRenderingContext2D, d: FallingDrop): void {
    const r = d.r;
    const sy = d.satellite ? 1.04 : Math.max(0.76, 1 + d.osc + Math.min(0.18, (d.vy / this.dpr) * 0.22));
    const sx = 1 / Math.sqrt(sy);
    const tail = d.satellite ? 0 : Math.max(0, 1 - d.age / 115);
    const topApex = -r * (1 + 0.52 * tail);

    ctx.save();
    ctx.translate(d.x, d.y);
    if (!d.satellite) {
      const flightAngle = Math.atan2(-d.vx, Math.max(0.08 * this.dpr, d.vy));
      ctx.rotate(Math.max(-0.45, Math.min(0.45, flightAngle * 0.55)));
    }
    ctx.scale(sx, sy);
    if (d.satellite) ctx.globalAlpha = 0.72;

    ctx.beginPath();
    if (d.satellite) {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    } else {
      ctx.arc(0, 0, r, 0, Math.PI, false);
      ctx.bezierCurveTo(
        -r,
        -r * (0.5523 - 0.1 * tail),
        -r * (0.5523 * (1 - tail) + 0.2 * tail),
        topApex + r * 0.28 * tail,
        0,
        topApex,
      );
      ctx.bezierCurveTo(
        r * (0.5523 * (1 - tail) + 0.2 * tail),
        topApex + r * 0.28 * tail,
        r,
        -r * (0.5523 - 0.1 * tail),
        r,
        0,
      );
      ctx.closePath();
    }
    this.fillWaterDrop(ctx, 0, 0, r, topApex);
    ctx.restore();
  }

  /** Fondo trasero de la peana, columna trasera y aros de sujeción (detrás del vidrio). */
  private drawHardwareBack(ctx: CanvasRenderingContext2D): void {
    const pal = studioPalette(this.isLight);
    const botTopY = this.botY + this.capThick * 0.08;

    ctx.save();
    // 1. Disco superior de la peana inferior (acero pavonado neutro, idéntico al reloj de arena).
    const discGrad = ctx.createLinearGradient(this.cx - this.capHalf, botTopY, this.cx + this.capHalf, botTopY);
    if (pal.isLight) {
      discGrad.addColorStop(0, '#babdc3');
      discGrad.addColorStop(0.28, '#e8eaee');
      discGrad.addColorStop(0.68, '#cfd2d8');
      discGrad.addColorStop(1, '#a3a7ae');
    } else {
      discGrad.addColorStop(0, '#131417');
      discGrad.addColorStop(0.26, '#2b2e34');
      discGrad.addColorStop(0.62, '#1d1f24');
      discGrad.addColorStop(1, '#0e0f12');
    }
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.ellipse(this.cx, botTopY, this.capHalf, this.capRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rebaje circular oscuro donde encaja la base gruesa del decantador.
    const seatRx = this.lowerProfile(1) * this.R * 1.04;
    ctx.fillStyle = pal.isLight ? 'rgba(30, 32, 36, 0.18)' : 'rgba(4, 5, 6, 0.78)';
    ctx.beginPath();
    ctx.ellipse(this.cx, botTopY + this.capRy * 0.04, seatRx, this.capRy * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();

    // Columna trasera del trípode (mismo lenguaje estructural que el reloj de arena).
    const rw = Math.max(1.8 * this.dpr, this.R * 0.022);
    const y0 = this.topY - this.capThick * 0.1;
    const y1 = this.botY + this.capThick * 0.08;
    ctx.save();
    ctx.globalAlpha = pal.isLight ? 0.14 : 0.15;
    const rearG = ctx.createLinearGradient(this.cx - rw, 0, this.cx + rw, 0);
    rearG.addColorStop(0, '#111214');
    rearG.addColorStop(0.36, '#8a8d94');
    rearG.addColorStop(1, '#111214');
    ctx.fillStyle = rearG;
    ctx.fillRect(this.cx - rw, y0, rw * 2, y1 - y0);
    ctx.restore();

    // 2. Mitad trasera de ambos aros de sujeción en latón envejecido (superior e inferior) unidos al bastidor.
    const ringRx = this.pillarX;
    const ringRy = Math.max(5 * this.dpr, ringRx * 0.085);
    const rearRingColor = pal.isLight ? 'rgba(122, 99, 62, 0.42)' : 'rgba(155, 129, 86, 0.36)';
    for (const ryPos of [this.waistRingY, this.lowerRingY]) {
      ctx.beginPath();
      ctx.ellipse(this.cx, ryPos, ringRx, ringRy, 0, Math.PI, Math.PI * 2);
      ctx.strokeStyle = rearRingColor;
      ctx.lineWidth = Math.max(2.4 * this.dpr, this.R * 0.032);
      ctx.stroke();
    }

    // 3. Borde trasero sutil de la boca superior (detrás de la columna de agua).
    const tipOuter = Math.max(3.2 * this.dpr, this.upperProfile(1) * this.R);
    const tipRy = Math.max(1.2 * this.dpr, tipOuter * 0.22);
    ctx.beginPath();
    ctx.ellipse(this.cx, this.nozzleY, tipOuter, tipRy, 0, Math.PI + 0.08, Math.PI * 2 - 0.08);
    ctx.strokeStyle = pal.isLight ? 'rgba(40, 44, 50, 0.18)' : 'rgba(224, 228, 234, 0.2)';
    ctx.lineWidth = Math.max(0.9, 1.05 * this.dpr);
    ctx.stroke();

    // 4. Borde trasero de la boca abierta del decantador inferior (detrás de las gotas que caen).
    const mouthRx = this.lowerProfile(0) * this.R;
    const mouthRy = Math.max(4.5 * this.dpr, mouthRx * 0.125);
    ctx.beginPath();
    ctx.ellipse(this.cx, this.lowerTopY, mouthRx, mouthRy, 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = pal.isLight ? 'rgba(40, 44, 50, 0.22)' : 'rgba(224, 228, 234, 0.24)';
    ctx.lineWidth = Math.max(1.3, 1.6 * this.dpr);
    ctx.stroke();
    ctx.restore();
  }

  /** Doble pared óptica de cristal borosilicato neutro, base sólida gruesa, boquilla 3D y reflejos softbox. */
  private drawGlassFront(ctx: CanvasRenderingContext2D): void {
    const pal = studioPalette(this.isLight);
    const rim = pal.glassOuterEdge;
    const innerEdge = pal.glassInnerEdge;
    const hi = pal.glassShine;

    // 1. Paredes laterales abiertas de la ampolla superior + embudo continuo hasta la boquilla.
    const uSteps = 52;
    const uh = this.nozzleY - this.topY;
    ctx.save();
    const wallGrad = ctx.createLinearGradient(this.cx - this.R, 0, this.cx + this.R, 0);
    wallGrad.addColorStop(0, pal.glassWallLeft);
    wallGrad.addColorStop(0.2, pal.isLight ? 'rgba(255, 255, 255, 0.7)' : 'rgba(240, 242, 246, 0.13)');
    wallGrad.addColorStop(0.5, pal.glassWallMid);
    wallGrad.addColorStop(0.84, pal.isLight ? 'rgba(255, 255, 255, 0.58)' : 'rgba(220, 212, 198, 0.1)');
    wallGrad.addColorStop(1, pal.glassWallRight);

    for (const side of [-1, 1]) {
      // Franja sólida de pared de vidrio en el costado `side` (termina abierta en nozzleY).
      ctx.beginPath();
      for (let i = 0; i <= uSteps; i++) {
        const u = i / uSteps;
        const y = this.topY + u * uh;
        const xo = this.upperProfile(u) * this.R;
        if (i === 0) ctx.moveTo(this.cx + side * xo, y);
        else ctx.lineTo(this.cx + side * xo, y);
      }
      for (let i = uSteps; i >= 0; i--) {
        const u = i / uSteps;
        const y = this.topY + u * uh;
        const xi = Math.max(2.4 * this.dpr, this.upperProfile(u) * this.R - this.upperWall(u));
        ctx.lineTo(this.cx + side * xi, y);
      }
      ctx.closePath();
      ctx.fillStyle = wallGrad;
      ctx.fill();

      // Trazo fino del borde interior y del borde exterior de cada pared (sin cruzar la boca).
      ctx.beginPath();
      for (let i = 0; i <= uSteps; i++) {
        const u = i / uSteps;
        const y = this.topY + u * uh;
        const xi = Math.max(2.4 * this.dpr, this.upperProfile(u) * this.R - this.upperWall(u));
        if (i === 0) ctx.moveTo(this.cx + side * xi, y);
        else ctx.lineTo(this.cx + side * xi, y);
      }
      ctx.strokeStyle = innerEdge;
      ctx.lineWidth = Math.max(0.7, 0.8 * this.dpr);
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i <= uSteps; i++) {
        const u = i / uSteps;
        const y = this.topY + u * uh;
        const xo = this.upperProfile(u) * this.R;
        if (i === 0) ctx.moveTo(this.cx + side * xo, y);
        else ctx.lineTo(this.cx + side * xo, y);
      }
      ctx.strokeStyle = rim;
      ctx.lineWidth = Math.max(1.25, 1.5 * this.dpr);
      ctx.stroke();
    }

    // Labio frontal de la boquilla con gradiente Fresnel neutro.
    const tipOuter = Math.max(3.2 * this.dpr, this.upperProfile(1) * this.R);
    const tipRy = Math.max(1.2 * this.dpr, tipOuter * 0.22);
    const lipGrad = ctx.createLinearGradient(this.cx - tipOuter, 0, this.cx + tipOuter, 0);
    if (pal.isLight) {
      lipGrad.addColorStop(0, 'rgba(42, 46, 52, 0.42)');
      lipGrad.addColorStop(0.22, 'rgba(255, 255, 255, 0.62)');
      lipGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.14)');
      lipGrad.addColorStop(0.78, 'rgba(255, 255, 255, 0.52)');
      lipGrad.addColorStop(1, 'rgba(42, 46, 52, 0.4)');
    } else {
      lipGrad.addColorStop(0, 'rgba(226, 232, 238, 0.48)');
      lipGrad.addColorStop(0.24, 'rgba(240, 244, 248, 0.28)');
      lipGrad.addColorStop(0.5, 'rgba(220, 226, 232, 0.12)');
      lipGrad.addColorStop(0.76, 'rgba(240, 244, 248, 0.24)');
      lipGrad.addColorStop(1, 'rgba(226, 232, 238, 0.44)');
    }
    ctx.beginPath();
    ctx.ellipse(this.cx, this.nozzleY, tipOuter, tipRy, 0, 0.04, Math.PI - 0.04);
    ctx.strokeStyle = lipGrad;
    ctx.lineWidth = Math.max(1, 1.15 * this.dpr);
    ctx.stroke();

    // 2. Decantador inferior: pared doble + base sólida gruesa de cristal óptico.
    const lOuter = new Path2D();
    const lInner = new Path2D();
    const lowerWallBand = new Path2D();
    {
      const steps = 44;
      const fullH = this.botY - this.lowerTopY;
      const floorY = this.lowerInnerFloorY();
      const inH = floorY - this.lowerTopY;
      const botRx = this.lowerProfile(1) * this.R;
      const botRy = Math.max(3.5 * this.dpr, botRx * 0.08);
      const inRx = Math.max(4 * this.dpr, this.lowerProfile(inH / fullH) * this.R - this.wallPx);
      const inRy = Math.max(3 * this.dpr, inRx * 0.08);

      for (let i = 0; i <= steps; i++) {
        const y = this.lowerTopY + (i / steps) * fullH;
        const u = i / steps;
        const x = this.cx + this.lowerProfile(u) * this.R;
        if (i === 0) lOuter.moveTo(x, y);
        else lOuter.lineTo(x, y);
      }
      lOuter.ellipse(this.cx, this.botY, botRx, botRy, 0, 0, Math.PI, false);
      for (let i = steps; i >= 0; i--) {
        const y = this.lowerTopY + (i / steps) * fullH;
        const u = i / steps;
        lOuter.lineTo(this.cx - this.lowerProfile(u) * this.R, y);
      }
      lOuter.closePath();

      for (let i = 0; i <= steps; i++) {
        const y = this.lowerTopY + (i / steps) * inH;
        const u = (y - this.lowerTopY) / fullH;
        const x = this.cx + Math.max(3 * this.dpr, this.lowerProfile(u) * this.R - this.wallPx);
        if (i === 0) lInner.moveTo(x, y);
        else lInner.lineTo(x, y);
      }
      lInner.ellipse(this.cx, floorY, inRx, inRy, 0, 0, Math.PI, false);
      for (let i = steps; i >= 0; i--) {
        const y = this.lowerTopY + (i / steps) * inH;
        const u = (y - this.lowerTopY) / fullH;
        lInner.lineTo(this.cx - Math.max(3 * this.dpr, this.lowerProfile(u) * this.R - this.wallPx), y);
      }
      lInner.closePath();

      lowerWallBand.addPath(lOuter);
      lowerWallBand.addPath(lInner);
    }

    ctx.fillStyle = wallGrad;
    ctx.fill(lowerWallBand, 'evenodd');

    // Refracción óptica neutra dentro de la base sólida gruesa del vaso inferior.
    const baseGlassY = this.lowerInnerFloorY();
    const baseH = this.lowerBaseGlassH();
    const baseRx = this.lowerProfile(0.95) * this.R;
    const baseGlow = ctx.createLinearGradient(this.cx - baseRx, baseGlassY, this.cx + baseRx, this.botY);
    baseGlow.addColorStop(0, 'rgba(216, 222, 228, 0.08)');
    baseGlow.addColorStop(0.32, `rgba(240, 244, 248, ${0.18 + this.causticPulse * 0.14})`);
    baseGlow.addColorStop(0.65, `rgba(216, 204, 182, ${0.1 + this.causticPulse * 0.08})`);
    baseGlow.addColorStop(1, 'rgba(190, 198, 206, 0.08)');
    ctx.save();
    ctx.clip(lowerWallBand, 'evenodd');
    ctx.fillStyle = baseGlow;
    ctx.fillRect(this.cx - baseRx - 4 * this.dpr, baseGlassY, (baseRx + 4 * this.dpr) * 2, baseH + 14 * this.dpr);
    ctx.restore();

    ctx.strokeStyle = innerEdge;
    ctx.lineWidth = Math.max(0.8, 0.9 * this.dpr);
    ctx.stroke(lInner);

    // Contorno exterior del decantador (abierto arriba para dibujar la boca elíptica frontal pulida).
    const steps = 44;
    const fullH = this.botY - this.lowerTopY;
    const botRx = this.lowerProfile(1) * this.R;
    const botRy = Math.max(3.5 * this.dpr, botRx * 0.08);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const y = this.lowerTopY + u * fullH;
      const x = this.cx + this.lowerProfile(u) * this.R;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.ellipse(this.cx, this.botY, botRx, botRy, 0, 0, Math.PI, false);
    for (let i = steps; i >= 0; i--) {
      const u = i / steps;
      const y = this.lowerTopY + u * fullH;
      ctx.lineTo(this.cx - this.lowerProfile(u) * this.R, y);
    }
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1.25, 1.5 * this.dpr);
    ctx.stroke();

    // Labio frontal pulido de la boca abierta 3D del decantador inferior.
    const mouthRx = this.lowerProfile(0) * this.R;
    const mouthRy = Math.max(4.5 * this.dpr, mouthRx * 0.125);
    ctx.beginPath();
    ctx.ellipse(this.cx, this.lowerTopY, mouthRx, mouthRy, 0, 0.02, Math.PI - 0.02);
    ctx.strokeStyle = pal.isLight ? 'rgba(255, 255, 255, 0.84)' : 'rgba(238, 242, 246, 0.46)';
    ctx.lineWidth = Math.max(1.4, 1.7 * this.dpr);
    ctx.stroke();

    // 3. Reflejos curvos de softbox de estudio sobre ambas piezas de cristal (se deslizan sutilmente al inclinar).
    const specShift = -Math.sin(this.clockAngle) * 0.14;
    ctx.lineCap = 'round';
    for (const [kBase, wMul, alpha, warm] of [
      [-0.78, 0.095, 0.9, false],
      [-0.58, 0.026, 0.44, false],
      [0.82, 0.04, 0.52, true],
    ] as const) {
      const k = Math.max(-0.89, Math.min(0.89, kBase + specShift));
      const col = warm ? pal.glassRimWarm : hi;
      // Ampolla superior (sigue la curva del embudo de forma natural hasta cerca de la boca).
      const y0 = this.topY + (this.nozzleY - this.topY) * 0.08;
      const y1 = this.topY + (this.nozzleY - this.topY) * 0.92;
      const gU = ctx.createLinearGradient(0, y0, 0, y1);
      gU.addColorStop(0, 'rgba(255,255,255,0)');
      gU.addColorStop(0.22, col);
      gU.addColorStop(0.76, col);
      gU.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const u = 0.08 + (i / 30) * 0.84;
        const y = this.topY + u * (this.nozzleY - this.topY);
        const x = this.cx + k * this.upperProfile(u) * this.R;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = gU;
      ctx.globalAlpha = 0.36 * alpha;
      ctx.lineWidth = Math.max(1.8 * this.dpr, this.R * wMul);
      ctx.stroke();
      ctx.globalAlpha = 0.76 * alpha;
      ctx.lineWidth = Math.max(1 * this.dpr, this.R * wMul * 0.22);
      ctx.stroke();

      // Decantador inferior.
      const ly0 = this.lowerTopY + (this.botY - this.lowerTopY) * 0.16;
      const ly1 = this.lowerTopY + (this.botY - this.lowerTopY) * 0.88;
      const gL = ctx.createLinearGradient(0, ly0, 0, ly1);
      gL.addColorStop(0, 'rgba(255,255,255,0)');
      gL.addColorStop(0.22, col);
      gL.addColorStop(0.78, col);
      gL.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const u = 0.16 + (i / 24) * 0.72;
        const y = this.lowerTopY + u * (this.botY - this.lowerTopY);
        const x = this.cx + k * this.lowerProfile(u) * this.R;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = gL;
      ctx.globalAlpha = 0.36 * alpha;
      ctx.lineWidth = Math.max(1.8 * this.dpr, this.R * wMul);
      ctx.stroke();
      ctx.globalAlpha = 0.76 * alpha;
      ctx.lineWidth = Math.max(1 * this.dpr, this.R * wMul * 0.22);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Marcas grabadas al ácido en perspectiva cilíndrica curva (como un instrumento de laboratorio). */
  private drawGraduations(ctx: CanvasRenderingContext2D): void {
    const startYear = civilFromDay(this.life.startDay).year;
    const endYear = civilFromDay(this.life.retireDay - 1).year;
    const span = Math.max(1, endYear - startYear);

    ctx.save();
    ctx.font = `500 ${Math.round(9 * this.dpr)}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const drawCurvedTicks = (yTop: number, yBot: number, halfAt: (y: number) => number) => {
      for (let i = 1; i <= 9; i++) {
        const frac = i / 10;
        const y = yBot - frac * (yBot - yTop);
        const hw = halfAt(y);
        if (hw < this.R * 0.32) continue;
        const major = i === 5;
        const len = (major ? 10 : 5) * this.dpr;
        const xRight = this.cx + hw - 3 * this.dpr;
        ctx.strokeStyle = this.isLight
          ? `rgba(40, 44, 50, ${major ? 0.28 : 0.13})`
          : `rgba(226, 230, 236, ${major ? 0.28 : 0.12})`;
        ctx.lineWidth = Math.max(0.8, 0.9 * this.dpr);
        ctx.beginPath();
        ctx.moveTo(xRight, y);
        ctx.quadraticCurveTo(xRight - len * 0.5, y + 1.1 * this.dpr, xRight - len, y + 1.4 * this.dpr);
        ctx.stroke();

        if (major) {
          ctx.fillStyle = this.isLight ? 'rgba(40, 44, 50, 0.34)' : 'rgba(226, 230, 236, 0.34)';
          ctx.fillText('50 %', xRight - len - 4 * this.dpr, y + 1.2 * this.dpr);
        }
      }
    };

    const upperTop = this.topY + (this.nozzleY - this.topY) * 0.1;
    const upperStem = this.topY + (this.nozzleY - this.topY) * 0.88;
    const lowerFloor = this.lowerInnerFloorY();
    const lowerTop = this.lowerTopY + (lowerFloor - this.lowerTopY) * 0.14;

    drawCurvedTicks(upperTop, upperStem, (y) => this.upperInnerHalfAt(y));
    drawCurvedTicks(lowerTop, lowerFloor, (y) => this.lowerInnerHalfAt(y));

    if (span >= 2) {
      ctx.textAlign = 'left';
      ctx.fillStyle = this.isLight ? 'rgba(40, 44, 50, 0.38)' : 'rgba(220, 224, 230, 0.36)';
      ctx.fillText(String(endYear), this.cx + this.pillarX + 8 * this.dpr, upperTop + 8 * this.dpr);
      ctx.fillText(String(startYear), this.cx + this.pillarX + 8 * this.dpr, lowerFloor - 8 * this.dpr);
    }
    ctx.restore();
  }

  /** Columnas de acero pavonado, aros de sujeción superior e inferior en latón envejecido y pedestales 3D. */
  private drawHardwareFront(ctx: CanvasRenderingContext2D): void {
    const pal = studioPalette(this.isLight);
    const pw = Math.max(2.6 * this.dpr, Math.min(5 * this.dpr, this.R * 0.042));
    const yTop = this.topY - this.capThick * 0.05;
    const yBot = this.botY + this.capThick * 0.12;

    // 1. Arcos frontales de ambos aros de latón envejecido (sujetan ampolla superior y decantador inferior al bastidor).
    const ringRx = this.pillarX;
    const ringRy = Math.max(5 * this.dpr, ringRx * 0.085);
    const brassRing = agedBrassGradient(ctx, this.cx - ringRx, this.cx + ringRx, pal);
    ctx.save();
    for (const ryPos of [this.waistRingY, this.lowerRingY]) {
      ctx.beginPath();
      ctx.ellipse(this.cx, ryPos, ringRx, ringRy, 0, 0.02, Math.PI - 0.02);
      ctx.strokeStyle = brassRing;
      ctx.lineWidth = Math.max(2.6 * this.dpr, this.R * 0.036);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Dos columnas cilíndricas laterales en acero pavonado + casquillos torneados en latón envejecido.
    for (const side of [-1, 1]) {
      const px = this.cx + side * this.pillarX;
      ctx.fillStyle = gunmetalGradient(ctx, px - pw, px + pw, pal);
      ctx.fillRect(px - pw, yTop, pw * 2, yBot - yTop);

      const fw = pw * 1.5;
      const fh = Math.max(4.5 * this.dpr, this.capThick * 0.36);
      for (const fy of [
        this.topY + this.capRy * 0.12,
        this.waistRingY - fh * 0.5,
        this.lowerRingY - fh * 0.5,
        yBot - fh,
      ]) {
        ctx.fillStyle = agedBrassGradient(ctx, px - fw, px + fw, pal);
        ctx.beginPath();
        ctx.roundRect(px - fw, fy, fw * 2, fh, fh * 0.35);
        ctx.fill();
      }
    }

    // 3. Corona superior y base inferior torneadas en 3D (idéntico acabado y familia que el reloj de arena).
    const drawCylinderCap = (faceY: number, isTop: boolean) => {
      const rx = this.capHalf;
      const ry = this.capRy;
      const botFaceY = faceY + this.capThick;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(this.cx, botFaceY, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(this.cx - rx, faceY);
      ctx.ellipse(this.cx, faceY, rx, ry, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fillStyle = gunmetalGradient(ctx, this.cx - rx, this.cx + rx, pal);
      ctx.fill();

      // Filete biselado en latón envejecido.
      ctx.strokeStyle = agedBrassGradient(ctx, this.cx - rx, this.cx + rx, pal, 0.88);
      ctx.lineWidth = Math.max(1.2, 1.45 * this.dpr);
      ctx.beginPath();
      ctx.ellipse(this.cx, isTop ? botFaceY - 1.2 * this.dpr : faceY + 1.2 * this.dpr, rx * 0.995, ry * 0.98, 0, 0.04, Math.PI - 0.04);
      ctx.stroke();

      if (isTop) {
        const topGrad = ctx.createLinearGradient(this.cx - rx, faceY - ry, this.cx + rx, faceY + ry);
        if (pal.isLight) {
          topGrad.addColorStop(0, '#f4f5f7');
          topGrad.addColorStop(0.5, '#d5d7dc');
          topGrad.addColorStop(1, '#b6b9c0');
        } else {
          topGrad.addColorStop(0, '#33363c');
          topGrad.addColorStop(0.42, '#202226');
          topGrad.addColorStop(1, '#111215');
        }
        ctx.fillStyle = topGrad;
        ctx.beginPath();
        ctx.ellipse(this.cx, faceY, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = pal.isLight ? 'rgba(255, 255, 255, 0.65)' : 'rgba(235, 237, 240, 0.13)';
        ctx.lineWidth = Math.max(0.9, 1 * this.dpr);
        ctx.beginPath();
        ctx.ellipse(this.cx, faceY, rx * 0.84, ry * 0.82, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Reborde frontal del asiento mecanizado donde descansa el decantador inferior.
        ctx.strokeStyle = pal.isLight ? 'rgba(255, 255, 255, 0.68)' : 'rgba(235, 237, 240, 0.18)';
        ctx.lineWidth = Math.max(1, 1.15 * this.dpr);
        ctx.beginPath();
        ctx.ellipse(this.cx, faceY, rx * 0.99, ry * 0.98, 0, 0.06, Math.PI - 0.06);
        ctx.stroke();

        // Anillo metálico sutil abrazando la base del cristal para soldarlo visualmente a la peana.
        const seatRx = this.lowerProfile(1) * this.R * 1.03;
        ctx.strokeStyle = agedBrassGradient(ctx, this.cx - seatRx, this.cx + seatRx, pal, 0.55);
        ctx.lineWidth = Math.max(1.1, 1.3 * this.dpr);
        ctx.beginPath();
        ctx.ellipse(this.cx, faceY - this.capRy * 0.08, seatRx, this.capRy * 0.62, 0, 0.06, Math.PI - 0.06);
        ctx.stroke();
      }

      ctx.strokeStyle = pal.isLight ? 'rgba(20, 22, 26, 0.22)' : 'rgba(0, 0, 0, 0.58)';
      ctx.lineWidth = Math.max(1, 1.1 * this.dpr);
      ctx.beginPath();
      ctx.ellipse(this.cx, botFaceY, rx, ry, 0, 0.02, Math.PI - 0.02);
      ctx.stroke();
      ctx.restore();
    };

    drawCylinderCap(this.topY - this.capThick - this.capRy * 0.2, true);
    drawCylinderCap(this.botY + this.capThick * 0.08, false);
  }

  draw(f: ClepsydraFrame): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const dt = this.lastTime > 0 ? Math.min(34, f.time - this.lastTime) : 16;
    this.lastTime = f.time;
    this.lastFraction = f.fraction;
    if (!f.reducedMotion) {
      this.stepPhysics(dt, f);
    } else if (f.fraction < 1) {
      const target = this.tipTargets(f.subSec, this.boreRadius());
      this.tipY = target.y;
      this.neckRatio = target.neck;
      this.tipX = 0;
    } else {
      this.tipY = 0;
      this.neckRatio = 1;
    }

    // 1. Plano de estudio común y sombra de contacto direccional coherente (se suaviza al inclinar).
    const baseBotY = this.botY + this.capThick * 1.1;
    const sinA = Math.sin(this.clockAngle);
    const lift = Math.abs(sinA);
    drawStudioSurface(ctx, W, H, baseBotY - this.capRy * 0.65, this.cx, this.capHalf, this.isLight);
    const shadowBaseX = this.cx + this.clockX + sinA * this.capHalf * 0.3;
    drawStudioShadow(
      ctx,
      shadowBaseX,
      baseBotY + this.capRy * (0.14 + lift * 0.22),
      this.capHalf * (1.04 + lift * 0.14),
      this.capRy * (1.18 + lift * 0.2),
      this.isLight,
      Math.max(0.45, 1 - lift * 0.38),
    );

    const surfTop = this.upperSurfaceY(1 - f.fraction);
    const surfBot = this.lowerSurfaceY(f.fraction);
    const topSlosh = this.topLocalSlosh();
    const botSlosh = this.botLocalSlosh();
    const tanBot = Math.tan(botSlosh);

    // 3–5. Interior del reloj transformado como cuerpo rígido (trasera, agua superior e inferior, ondas y salpicaduras).
    ctx.save();
    this.applyClockTransform(ctx);

    this.drawHardwareBack(ctx);

    // Cuerpo único de agua superior + extremo inferior simulado (menisco/pandeo/cuello en un solo trazado).
    ctx.save();
    this.traceUpperFluidPath(ctx, f.fraction < 1);
    ctx.clip();
    const upperBottomY = this.nozzleY + Math.max(0, this.tipY) + 4 * this.dpr;
    this.drawLiquid(ctx, surfTop, upperBottomY, this.topH, (y) => this.upperInnerHalfAt(y), f, true, topSlosh);
    ctx.restore();

    // Líquido en el decantador inferior + ondas 3D inclinadas solidarias con la superficie real.
    ctx.save();
    this.traceLowerPath(ctx, true);
    ctx.clip();
    this.drawLiquid(ctx, surfBot, this.lowerInnerFloorY() + 6 * this.dpr, this.botH, (y) => this.lowerInnerHalfAt(y), f, false, botSlosh);

    // Doble aro de onda superficial 3D apoyado sobre el ángulo real de la superficie inferior.
    for (const rp of this.ripples) {
      if (rp.chamber !== 'bot') continue;
      const rpY = surfBot + (rp.x - this.cx) * tanBot;
      ctx.strokeStyle = this.isLight
        ? `rgba(255, 255, 255, ${rp.alpha * 0.85})`
        : `rgba(242, 246, 250, ${rp.alpha * 0.78})`;
      ctx.lineWidth = Math.max(1, 1.3 * this.dpr);
      ctx.beginPath();
      ctx.ellipse(rp.x, rpY, rp.rx, rp.rx * 0.21, botSlosh, 0, Math.PI * 2);
      ctx.stroke();

      if (rp.rx > 10 * this.dpr) {
        ctx.strokeStyle = `rgba(10, 12, 14, ${rp.alpha * 0.34})`;
        ctx.lineWidth = Math.max(0.8, 1 * this.dpr);
        ctx.beginPath();
        ctx.ellipse(rp.x, rpY + 0.8 * this.dpr, rp.rx * 0.72, rp.rx * 0.15, botSlosh, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Micro-gotitas translúcidas de salpicadura en el espacio local del vaso inferior.
    for (const b of this.beads) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, b.life * 0.78);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      this.fillWaterDrop(ctx, b.x, b.y, b.r, b.y - b.r);
      ctx.restore();
    }

    ctx.restore();

    // 6. Gotas desprendidas en coordenadas reales de mundo (caen en vertical real; delante de boca trasera, detrás de cristal frontal).
    for (const d of this.drops) this.drawFallingDrop(ctx, d);

    // 7–8. Cristal óptico delantero, graduaciones y estructura metálica rotados solidariamente con el reloj.
    ctx.save();
    this.applyClockTransform(ctx);
    this.drawGlassFront(ctx);
    this.drawGraduations(ctx);
    this.drawHardwareFront(ctx);
    ctx.restore();
  }

  /** Instantánea para la tarjeta de compartir (extremo estirado + gota cayendo + onda + cáusticas). */
  snapshot(width: number, height: number, frame: ClepsydraFrame): { canvas: HTMLCanvasElement } {
    const canvas = document.createElement('canvas');
    const view = new ClepsydraView(canvas, this.life);
    view.resize(width, height, 1);
    if (frame.fraction < 1) {
      const b = view.boreRadius();
      const midY = (view.nozzleY + view.lowerSurfaceY(frame.fraction)) * 0.56;
      view.drops.push({
        x: view.cx,
        y: midY,
        vx: 0,
        vy: 0.28,
        r: b * 0.88,
        osc: 0.08,
        oscV: 0,
        age: 140,
      });
      view.ripples.push({
        x: view.cx,
        rx: view.R * 0.26,
        maxRx: view.R * 0.65,
        alpha: 0.68,
        chamber: 'bot',
      });
      view.causticPulse = 0.55;
    }
    view.draw({ ...frame, subSec: 0.84, reducedMotion: true });
    return { canvas };
  }
}
