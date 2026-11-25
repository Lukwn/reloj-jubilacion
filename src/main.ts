import './style.css';
import {
  buildLife,
  formatDayLong,
  formatInt,
  formatPercent,
  localDayNumber,
  msUntilNextLocalMidnight,
  validateConfig,
  type Life,
  type LifeConfig,
} from './dates';
import { grainPhrase, hash32, phraseFor, UNIT_PHRASES } from './phrases';
import { REGIONS, regionById, regionSummary } from './holidays';
import { downloadRetirementIcs } from './calendar';
import {
  buildGrains,
  careerSeconds,
  fallenAt,
  fallenAtDay,
  formatClock,
  grainTitle,
  grainWhen,
  isUnitId,
  groupLabel,
  jornadaFor,
  lifeSeconds,
  lifeSecondsAtDay,
  plural as unitPlural,
  UNIT_IDS,
  UNIT_NAMES,
  unitCountdown,
  windowDayFor,
  type GrainSet,
  type UnitId,
} from './units';
import { designHourglass, type Hourglass } from './hourglass';
import { EMPTY, SandSim, type GrainSim } from './sim';
import { LENS_RADIUS, Renderer, type HeroDraw, type Point } from './render';
import { CoinsView, type AltFrame } from './coins';
import { TreeView } from './tree';
import { ClepsydraView, type ClepsydraFrame, type ClepsydraPick } from './clepsydra';
import { advanceFall, neckOpen, startFall, type FallingGrain } from './falling';
import { motionImpulse, type ShakeImpulse } from './shake';
import { dimColors, grainColors, unpackColor, yearLayers, type YearLayers } from './colors';
import {
  loadConfig,
  loadLayers,
  loadMilestonesSeen,
  loadProgress,
  loadSound,
  saveConfig,
  saveLayers,
  saveMilestonesSeen,
  saveProgress,
  saveSound,
  loadUnit,
  saveUnit,
} from './storage';
import { milestonesFor, nextMilestone, type Milestone } from './milestones';
import { SandSound } from './sound';
import { CLOCK_SIZE, drawCard, SHARE_URL, shareText, toBlob } from './share';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('reloj');
const counterEl = $('contador');
const hintEl = $('pista');
const tooltipEl = $('tooltip');
const tooltipDate = $('tooltip-fecha');
const tooltipPhrase = $('tooltip-frase');
const tooltipYear = $('tooltip-anio');
const tooltipWhen = $('tooltip-cuando');
const lensLabel = $('etiqueta-lupa');
const layersBtn = $<HTMLButtonElement>('btn-capas');
const customBtn = $<HTMLButtonElement>('btn-personalizar');
const sortBtn = $<HTMLButtonElement>('btn-ordenar');
const playBtn = $<HTMLButtonElement>('btn-play');
const playPanel = $('panel-play');
const playDate = $('play-fecha');
const playStatus = $('play-estado');
const playStart = $<HTMLButtonElement>('btn-play-inicio');
const playPause = $<HTMLButtonElement>('btn-play-pausa');
const playClose = $<HTMLButtonElement>('btn-play-cerrar');
const playSpeed = $<HTMLInputElement>('play-velocidad');
const playSpeedLabel = $('play-vel');
const tooltipMilestone = $('tooltip-hito');
const soundBtn = $<HTMLButtonElement>('btn-sonido');
const shareBtn = $<HTMLButtonElement>('btn-compartir');
const countdownEl = $('cuenta');
const milestoneEl = $('hito');
const milestoneTitle = $('hito-titulo');
const milestoneDate = $('hito-fecha');
const ageBtn = $<HTMLButtonElement>('btn-edad');
const agePanel = $('panel-edad');
const ageInput = $<HTMLInputElement>('edad');
const ageValue = $('edad-valor');
const ageText = $('edad-texto');
const ageUse = $<HTMLButtonElement>('btn-edad-usar');
const ageClose = $<HTMLButtonElement>('btn-edad-cerrar');
const shareDialog = $<HTMLDialogElement>('compartir');
const shareImg = $<HTMLImageElement>('compartir-img');
const shareStatus = $('compartir-estado');
const shareCopy = $<HTMLButtonElement>('btn-compartir-copiar');
const shareDownload = $<HTMLAnchorElement>('btn-compartir-descargar');
const shareSystem = $<HTMLButtonElement>('btn-compartir-sistema');
const shareClose = $<HTMLButtonElement>('btn-compartir-cerrar');
const dialog = $<HTMLDialogElement>('ajustes');
const form = $<HTMLFormElement>('form-ajustes');
const formError = $('error-ajustes');
const cancelBtn = $<HTMLButtonElement>('btn-cancelar');
const fpsEl = $('fps');

const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = reducedMotionQuery.matches;
reducedMotionQuery.addEventListener('change', () => (reducedMotion = reducedMotionQuery.matches));

interface Hero {
  id: number;
  t0: number;
  glowMs: number;
  fallMs: number;
  /** Último instante simulado de la caída. */
  last: number;
  fall: FallingGrain;
  bright: number;
}

interface World {
  cfg: LifeConfig;
  life: Life;
  unit: UnitId;
  /** Los granos de la unidad: días, segundos de la jornada, nóminas o años. */
  grains: GrainSet;
  hg: Hourglass | null;
  sim: GrainSim | null;
  /** Vista dedicada para unidades alternativas (clepsidra en segundos, monedas 3D en nóminas, árbol en años). */
  altView: CoinsView | TreeView | ClepsydraView | null;
  /** Paleta activa: la arena normal o las capas por años. */
  colors: Uint32Array;
  sandColors: Uint32Array;
  sandDim: Uint32Array;
  layers: YearLayers;
  /** Inicio y festivos: si no cambian, los granos caídos siguen siendo los mismos. */
  key: string;
  milestones: Milestone[];
  milestoneById: Map<number, Milestone>;
  /** Los hitos de los granos anteriores a este ya se celebraron (o eran del pasado). */
  seenUpTo: number;
  /** Hito alcanzado que se celebrará cuando termine de caer la arena. */
  pendingMilestone: Milestone | null;
  renderer: Renderer | null;
  today: number;
  /** Granos que deberían haber caído según la fecha de hoy. */
  target: number;
  /** Granos ya posados en el bulbo inferior (o monedas/anillos completados). */
  landed: number;
  /** Siguiente grano que saldrá por el cuello. */
  nextDrop: number;
  heroes: Hero[];
  nextSpawnAt: number;
  catchUpInterval: number;
}

let world: World | null = null;
let selectedId = -1;
/** Elemento bajo el ratón en las vistas alternativas (monedas / árbol), o -1. */
let hoverAltId = -1;
let layersOn = loadLayers();
/** Año bajo el ratón en el modo de capas, o -1. */
let hoverYear = -1;

// ---------------------------------------------------------------- mundo

/** Configuración de ejemplo para la primera visita (el reloj arranca vivo en vez de bloquear con el formulario). */
const DEMO_CONFIG: LifeConfig = {
  birthDate: '1992-05-15',
  retirementAge: 67,
  workStartDate: '2016-09-01',
  holyThursday: true,
  easterMonday: false,
  extraHolidays: '',
  pagas: 14,
  jornadaInicio: '09:00',
  jornadaFin: '18:00',
  comidaInicio: '14:00',
  comidaFin: '15:00',
};
let isDemoConfig = false;

/** Unidad de tiempo de los granos. */
let unit: UnitId = loadUnit();

/**
 * Lo que determina qué es cada grano caído: el inicio y los festivos (no la edad de
 * jubilación) y, en nóminas, las pagas al año.
 */
function lifeKey(cfg: LifeConfig, u: UnitId): string {
  const key: unknown[] = [cfg.workStartDate, cfg.holyThursday ?? true, cfg.easterMonday ?? false, (cfg.extraHolidays ?? '').trim()];
  if (cfg.region) key.push(cfg.region);
  // Los días eran laborables y ahora son naturales: lo guardado con la versión anterior no vale.
  if (u === 'dias') key.push('naturales');
  if (u === 'nominas') key.push(cfg.pagas === 12 ? 12 : 14);
  return JSON.stringify(key);
}

/** `shownOverride`: granos que empiezan ya caídos (0 para reproducir desde el principio). */
function createWorld(cfg: LifeConfig, shownOverride?: number): void {
  const life = buildLife(cfg);
  const now = new Date();
  const today = localDayNumber(now);
  const grains = buildGrains(life, cfg, unit, now);
  const target = fallenAt(grains, now);
  const key = lifeKey(cfg, unit);
  // Los segundos son solo la jornada de hoy: no hay nada que recordar entre visitas.
  const live = unit === 'segundos';
  const prog = live ? null : loadProgress(unit);
  const sameLife = prog && prog.startDay === life.startDay && (prog.key ? prog.key === key : prog.total === grains.total);
  // En modo ejemplo (primera visita) el reloj arranca ya poblado para mostrar el efecto al instante.
  const demoShown = live ? target : Math.max(0, target - (unit === 'dias' ? 18 : 0));
  const shown =
    shownOverride ?? (isDemoConfig ? demoShown : live ? target : sameLife ? Math.max(0, Math.min(prog.landed, target)) : 0);

  const sandColors = grainColors(grains, life.startDay, life.isWorkday);
  const layers = yearLayers(grains, life.startDay);

  let hg: Hourglass | null = null;
  let sim: GrainSim | null = null;
  let renderer: Renderer | null = null;
  let altView: CoinsView | TreeView | ClepsydraView | null = null;

  if (unit === 'nominas') {
    const coins = new CoinsView(canvas, grains, shown);
    coins.onClink = (extra, strength) => sound.coin(extra, strength);
    coins.onMessyChange = () => updateSortButton();
    altView = coins;
    if (topExtra) {
      altView.topExtra = topExtra;
      altView.resize();
    }
  } else if (unit === 'anios') {
    altView = new TreeView(canvas, grains, shown, life.startDay);
    if (topExtra) {
      altView.topExtra = topExtra;
      altView.resize();
    }
  } else if (unit === 'segundos') {
    const clepsydra = new ClepsydraView(canvas, life);
    clepsydra.onDrop = (strength) => sound.drop(strength);
    altView = clepsydra;
    if (topExtra) {
      altView.topExtra = topExtra;
      altView.resize();
    }
  } else {
    hg = designHourglass(grains.total);
    sim = new SandSim(hg, grains.total);
    sim.pack(shown);
    renderer = new Renderer(canvas, hg, sim, sandColors);
    if (topExtra) {
      renderer.topExtra = topExtra;
      renderer.resize();
    }
  }

  const milestones = milestonesFor(grains.total, unit);
  // La primera vez, los hitos ya pasados no se celebran (caerían todos de golpe).
  const seen = live ? null : loadMilestonesSeen(unit);

  world = {
    cfg,
    life,
    unit,
    grains,
    hg,
    sim,
    altView,
    colors: sandColors,
    sandColors,
    sandDim: dimColors(sandColors),
    layers,
    key,
    milestones,
    milestoneById: new Map(milestones.map((m) => [m.id, m])),
    seenUpTo: seen && seen.key === key ? seen.upTo : target,
    pendingMilestone: null,
    renderer,
    today,
    target,
    landed: shown,
    nextDrop: shown,
    heroes: [],
    nextSpawnAt: performance.now() + 500,
    catchUpInterval: 0,
  };
  canvas.classList.toggle('vista-alt', !!altView);
  canvas.classList.remove('moneda-cogible');
  updateSortButton();
  viewAngle = 0;
  tiltTarget = 0;
  tilting = false;
  spinStart = -1;
  applyPalette(world);
  endSort();
  selectedId = -1;
  hoverAltId = -1;
  hideTooltip();
  persistProgress(world);
  updateCounter();
  updateCountdown();
}

function persistProgress(w: World): void {
  // Ni la reproducción, ni el ejemplo de primera visita ni los segundos de hoy se guardan.
  if (play || isDemoConfig || w.unit === 'segundos') return;
  saveProgress({ startDay: w.life.startDay, total: w.grains.total, landed: w.landed, key: w.key }, w.unit);
  saveMilestonesSeen({ key: w.key, upTo: w.seenUpTo }, w.unit);
}

function checkDay(): void {
  const w = world;
  if (!w || play) return;
  const now = new Date();
  // A medianoche, la unidad de segundos pasa a la jornada siguiente.
  if (w.unit === 'segundos' && windowDayFor(w.life, now) !== w.grains.window!.day) {
    createWorld(w.cfg);
    return;
  }
  w.today = localDayNumber(now);
  w.target = fallenAt(w.grains, now);
  updateCounter();
}

let midnightTimer = 0;
function scheduleMidnight(): void {
  clearTimeout(midnightTimer);
  midnightTimer = window.setTimeout(() => {
    checkDay();
    scheduleMidnight();
  }, msUntilNextLocalMidnight(new Date()) + 250);
}

// ---------------------------------------------------------------- caída de granos

function cellPoint(w: World, idx: number): Point {
  const W = w.hg!.W;
  return { x: (idx % W) + 0.5, y: Math.floor(idx / W) + 0.5 };
}

/** Saca por el cuello el siguiente grano. El cuello nunca deja pasar otro. */
function spawnHero(w: World, now: number, glowMs: number, fallMs: number, bright: number): Hero | null {
  const { sim, hg } = w;
  if (!sim || !hg) return null;
  const id = w.nextDrop;
  if (sim.pos[id] < 0) return null;
  // El grano más cercano al cuello adopta la identidad del día que toca.
  const neck = sim.findNeckGrain();
  if (neck >= 0 && neck !== sim.pos[id]) sim.swapCells(neck, sim.pos[id]);
  const from = sim.pointOf(id)!;
  sim.take(id);
  w.nextDrop++;
  const landing = sim.findLandingCell(0);
  const toY = landing >= 0 ? cellPoint(w, landing).y : hg.H - 1;
  const lane = hg.W / 2 - 0.5 + (id & 1);
  const start = now + glowMs;
  const fall = startFall(from.x, from.y, toY - from.y, fallMs, lane);
  const hero: Hero = { id, t0: now, glowMs, fallMs, last: start, fall, bright };
  w.heroes.push(hero);
  return hero;
}

/** Posa el grano en la celda donde ha chocado (o, si ya no está libre, en la cima del montón). */
function landHero(w: World, h: Hero, cell = -1): void {
  const sim = w.sim;
  if (!sim) return;
  const idx = cell >= 0 && sim.grid[cell] === EMPTY ? cell : sim.findLandingCell();
  if (idx >= 0) sim.put(h.id, idx);
  w.landed++;
  const m = w.milestoneById.get(h.id);
  if (m && play) {
    if (m.id > play.celebrated) {
      play.celebrated = m.id;
      celebrate(w, m);
    }
  } else if (m && h.id >= w.seenUpTo) w.pendingMilestone = m;
  if (w.landed > w.seenUpTo) w.seenUpTo = w.landed;
  if (h.bright >= 1) sound.tink();
  else if (play && SPEEDS[speedIdx][0] <= 7) sound.tink(0.45);
  if (w.heroes.length === 0 || w.landed % 50 === 0) persistProgress(w);
  updateCounter();
}

function heroPoint(h: Hero): Point {
  return { x: h.fall.x, y: h.fall.y };
}

/** Mueve los granos que caen con la gravedad actual y posa los que han chocado. */
function updateHeroes(w: World, now: number): void {
  const sim = w.sim;
  if (!sim) return;
  const angle = sim.fallAngle;
  for (let i = w.heroes.length - 1; i >= 0; i--) {
    const h = w.heroes[i];
    const start = h.t0 + h.glowMs;
    if (now <= start) continue;
    const dt = Math.min(50, now - Math.max(h.last, start));
    h.last = now;
    const cell = advanceFall(h.fall, sim, angle, dt);
    const stuck = cell < 0 && now - start > h.fallMs * 6 + 4000;
    if (cell < 0 && !stuck) continue;
    w.heroes.splice(i, 1);
    landHero(w, h, cell);
  }
}

/** ¿Pasa la arena por el cuello? No si el reloj (o el móvil) está tumbado o boca abajo. */
function neckFlows(w: World): boolean {
  return !w.sim || neckOpen(w.sim.fallAngle);
}

/** Avanza una o varias unidades en las vistas alternativas (monedas 8-bits de nóminas y anillos de árbol de años). */
function advanceAltUnit(w: World, nextCount: number, now: number): void {
  const prev = w.landed;
  if (nextCount <= prev) return;
  w.landed = Math.min(w.grains.total, nextCount);
  w.nextDrop = w.landed;
  if (w.altView instanceof CoinsView) {
    w.altView.notifyLanded(w.landed, now, reducedMotion);
  } else if (w.altView instanceof TreeView) {
    w.altView.notifyLanded(w.landed, reducedMotion);
    if (!play || SPEEDS[speedIdx][0] <= 365.25) sound.wood(w.landed - prev > 1 ? 0.6 : 0.95);
  }
  for (let id = prev; id < w.landed; id++) {
    const m = w.milestoneById.get(id);
    if (m && play) {
      if (m.id > play.celebrated) {
        play.celebrated = m.id;
        celebrate(w, m);
      }
    } else if (m && id >= w.seenUpTo) {
      w.pendingMilestone = m;
    }
  }
  if (w.landed > w.seenUpTo) w.seenUpTo = w.landed;
  if (w.landed >= w.target || w.landed % 20 === 0) persistProgress(w);
  updateCounter();
}

function updateDrops(w: World, now: number): void {
  // Vistas alternativas (pilas de monedas 8-bits y anillos de árbol): 100 % sincronizadas con el calendario y el slider.
  if (w.altView) {
    const backlog = w.target - w.landed;
    if (!play && w.pendingMilestone && backlog <= 0) {
      celebrate(w, w.pendingMilestone);
      w.pendingMilestone = null;
      persistProgress(w);
    }
    if (backlog <= 0) {
      w.catchUpInterval = 0;
      return;
    }
    if (play || reducedMotion) {
      advanceAltUnit(w, w.target, now);
      return;
    }
    if (now < w.nextSpawnAt) return;
    if (backlog > 1) {
      if (w.catchUpInterval === 0) w.catchUpInterval = Math.min(220, 3000 / backlog);
      if (now - w.nextSpawnAt > 250) w.nextSpawnAt = now;
      let step = 0;
      while (now >= w.nextSpawnAt && w.landed + step < w.target && step < 40) {
        step++;
        w.nextSpawnAt += w.catchUpInterval;
      }
      if (w.nextSpawnAt < now) w.nextSpawnAt = now;
      if (step > 0) advanceAltUnit(w, w.landed + step, now);
      return;
    }
    advanceAltUnit(w, w.landed + 1, now);
    w.nextSpawnAt = now + 400;
    return;
  }

  updateHeroes(w, now);

  if (play) {
    spawnPlayGrains(w, now);
    return;
  }

  // Un hito se celebra cuando ha terminado de caer la arena pendiente.
  if (w.pendingMilestone && w.heroes.length === 0 && w.nextDrop >= w.target) {
    celebrate(w, w.pendingMilestone);
    w.pendingMilestone = null;
    persistProgress(w);
  }

  if (now < w.nextSpawnAt) return;
  const backlog = w.target - w.nextDrop;
  if (backlog <= 0) {
    w.catchUpInterval = 0;
    return;
  }
  // Con el reloj tumbado la arena no pasa: esperan en el bulbo de arriba hasta que se endereza.
  if (!neckFlows(w)) return;

  // Segundos: un grano por segundo, en un goteo constante, sin esperar a que se pose el anterior.
  if (w.unit === 'segundos' && backlog <= 3) {
    while (w.nextDrop < w.target) if (!spawnHero(w, now, 0, reducedMotion ? 350 : 900, 0.15)) break;
    return;
  }

  if (backlog > 1) {
    // Recuperación: los días pendientes desde la última visita caen en un chorro rápido.
    if (reducedMotion) {
      while (w.target - w.nextDrop > 1) {
        const h = spawnHero(w, now, 0, 0, 0);
        if (!h) break;
        w.heroes.pop();
        landHero(w, h);
      }
      return;
    }
    // Unos 6 s en total, sea cual sea el número de días; con muchos salen varios por fotograma.
    if (w.catchUpInterval === 0) w.catchUpInterval = Math.min(300, 6000 / backlog);
    const bright = backlog > 60 ? 0 : 0.35;
    // Si la pestaña estuvo sin fotogramas, se retoma desde ahora en vez de soltarlo todo de golpe.
    if (now - w.nextSpawnAt > 250) w.nextSpawnAt = now;
    let budget = 400;
    while (now >= w.nextSpawnAt && w.target - w.nextDrop > 1 && budget-- > 0) {
      if (!spawnHero(w, now, 0, 520, bright)) break;
      w.nextSpawnAt += w.catchUpInterval;
    }
    if (w.nextSpawnAt < now) w.nextSpawnAt = now;
    return;
  }

  // El grano del día: brilla un momento en el cuello y cae despacio.
  if (w.heroes.length === 0) {
    if (reducedMotion) spawnHero(w, now, 0, 350, 0.3);
    else spawnHero(w, now, 1100, 1900, 1);
    w.nextSpawnAt = now + 400;
  }
}

/** Mantiene el grano de hoy en la boca del cuello mientras la arena está quieta. */
function keepTodayAtNeck(w: World): void {
  const sim = w.sim;
  const id = w.target;
  // En segundos y vistas alternativas no hay un grano esperando en el cuello.
  if (!sim || w.unit === 'segundos' || id >= w.grains.total || w.nextDrop !== w.target || sim.agitation > 0) return;
  const at = sim.pos[id];
  if (at < 0) return;
  const neck = sim.findNeckGrain(0);
  if (neck >= 0 && neck !== at) sim.swapCells(neck, at);
}

// ---------------------------------------------------------------- agitación

let lastWakeAll = 0;
function applyShake(imp: ShakeImpulse): void {
  const w = world;
  if (!w || reducedMotion) return;
  if (w.altView instanceof CoinsView || w.altView instanceof ClepsydraView) {
    w.altView.tremor(imp.intensity);
    return;
  }
  if (!w.sim) return;
  w.sim.agitation = Math.max(w.sim.agitation, imp.intensity);
  w.sim.tilt = imp.dir * 0.75 * imp.intensity;
  const now = performance.now();
  if (now - lastWakeAll > 200) {
    w.sim.wakeAll();
    lastWakeAll = now;
  }
}


const motionPrev = { x: 0, y: 0, z: 0 };
window.addEventListener('devicemotion', (e) => {
  const imp = motionImpulse(e, motionPrev);
  if (imp) applyShake(imp);
});

// ---------------------------------------------------------------- giroscopio

/** Diferencia de ángulos en (-π, π]. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

let gyroAngle = 0;
let lastGyroWake = 0;

/**
 * Inclina la gravedad de la arena según la orientación del móvil. Se usan beta y gamma de
 * deviceorientation (iOS y Android coinciden en ellos; en la aceleración, no) para calcular
 * hacia dónde cae la gravedad en la pantalla.
 */
window.addEventListener('deviceorientation', (e) => {
  const w = world;
  if (!w || reducedMotion || e.beta === null || e.gamma === null) return;
  const b = (e.beta * Math.PI) / 180;
  const g = (e.gamma * Math.PI) / 180;
  // Gravedad en el plano de la pantalla (x a la derecha, y hacia abajo).
  const gx = Math.sin(g) * Math.cos(b);
  const gy = Math.sin(b);
  // Con el móvil casi en horizontal la gravedad no apunta a ningún lado de la pantalla.
  if (Math.hypot(gx, gy) < 0.35) return;
  const turn = ((screen.orientation?.angle ?? 0) * Math.PI) / 180;
  let phone = angleDelta(0, Math.atan2(gx, gy) - turn);
  if (Math.abs(phone) < 0.08) phone = 0;
  const target = phone + 0.5 * Math.sin(phone);
  gyroAngle += angleDelta(gyroAngle, target) * 0.3;
  if (w.altView instanceof CoinsView || w.altView instanceof ClepsydraView) {
    w.altView.setTilt(gyroAngle);
    return;
  }
  if (!w.sim) return;
  const moved = Math.abs(angleDelta(w.sim.gravityAngle, gyroAngle));
  w.sim.gravityAngle = gyroAngle;
  const now = performance.now();
  if (moved > 0.03 && now - lastGyroWake > 150) {
    w.sim.wakeAll();
    lastGyroWake = now;
  }
});

let motionPermissionAsked = false;
function askMotionPermission(): void {
  if (motionPermissionAsked) return;
  motionPermissionAsked = true;
  const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } })
    .DeviceMotionEvent;
  if (DME && typeof DME.requestPermission === 'function') DME.requestPermission().catch(() => undefined);
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
    .DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') DOE.requestPermission().catch(() => undefined);
}

// ---------------------------------------------------------------- tooltip

function pickGrain(w: World, cssX: number, cssY: number, touch: boolean): number {
  if (w.altView) return w.altView.pick(cssX, cssY);
  const { renderer, sim } = w;
  if (!renderer || !sim) return -1;
  const g = renderer.toGrid(cssX, cssY);
  const reach = Math.max(1.5, ((touch ? 16 : 7) * renderer.dpr) / renderer.s);
  for (const h of w.heroes) {
    const p = heroPoint(h);
    if (Math.hypot(p.x - g.x, p.y - g.y) <= reach * 1.5) return h.id;
  }
  // Con el dedo, los hitos que brillan son más fáciles de tocar. Con el ratón (y la lupa)
  // manda el grano que hay justo debajo.
  for (const m of touch ? w.milestones : []) {
    const p = m.id < w.landed ? null : sim.pointOf(m.id);
    if (p && Math.hypot(p.x - g.x, p.y - g.y) <= reach * 2) return m.id;
  }
  // Las canicas saben exactamente dónde está cada una.
  if (sim.nearest) return sim.nearest(g.x, g.y, touch ? 1 : 0.5);
  const r = Math.ceil(reach);
  const gx = Math.floor(g.x);
  const gy = Math.floor(g.y);
  let best = -1;
  let bestD = Infinity;
  for (let y = gy - r; y <= gy + r; y++) {
    if (y < 0 || y >= sim.H) continue;
    for (let x = gx - r; x <= gx + r; x++) {
      if (x < 0 || x >= sim.W) continue;
      const v = sim.grid[y * sim.W + x];
      if (v <= 0) continue;
      const d = (x + 0.5 - g.x) ** 2 + (y + 0.5 - g.y) ** 2;
      if (d < bestD && d <= reach * reach) {
        bestD = d;
        best = v - 1;
      }
    }
  }
  return best;
}

function showTooltip(w: World, id: number, cssX: number, cssY: number): void {
  tooltipDate.textContent = grainTitle(w.grains, id);
  tooltipWhen.textContent = whenText(w, id);
  tooltipPhrase.textContent = grainPhrase(w.grains, id, {
    today: w.today,
    birthDay: w.life.birthDay,
    lastDay: w.grains.days[w.grains.total - 1],
    isWorkday: w.life.isWorkday,
    target: w.target,
  });
  // En años, cada capa es un solo grano y el título ya dice cuál es.
  const summary = layersOn && w.unit !== 'anios';
  if (summary) tooltipYear.textContent = yearSummary(w, w.layers.yearOf[id]);
  tooltipYear.hidden = !summary;
  const m = w.milestoneById.get(id);
  tooltipMilestone.hidden = !m;
  if (m) tooltipMilestone.textContent = m.id >= w.landed ? `Hito: ${m.label}` : `Hito alcanzado: ${m.label}`;
  tooltipEl.hidden = false;
  const rect = tooltipEl.getBoundingClientRect();
  let left = cssX + 14;
  let top = cssY + 14;
  if (left + rect.width > window.innerWidth - 8) left = cssX - rect.width - 14;
  if (top + rect.height > window.innerHeight - 8) top = cssY - rect.height - 14;
  tooltipEl.style.left = `${Math.max(8, left)}px`;
  tooltipEl.style.top = `${Math.max(8, top)}px`;
}

function showClepsydraTooltip(w: World, pick: ClepsydraPick, cssX: number, cssY: number): void {
  const now = new Date();
  const ls = play ? lifeSecondsAtDay(w.life, play.day) : lifeSeconds(w.life, now);
  if (pick.kind === 'drop') {
    const secOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    tooltipDate.textContent = play ? `Reproduciendo · ${formatDayLong(Math.floor(play.day))}` : `Ahora mismo · ${formatClock(secOfDay)}`;
    tooltipWhen.textContent = `Quedan ${formatInt(ls.left)} segundos · llevas ${formatInt(ls.done)}`;
    const pool = UNIT_PHRASES.segundo;
    tooltipPhrase.textContent = pool[hash32(ls.done * 31 + 7) % pool.length];
    tooltipYear.hidden = true;
  } else {
    tooltipDate.textContent = formatDayLong(pick.day);
    const diffDays = pick.day - w.today;
    const diffSecs = Math.abs(diffDays) * 86_400;
    tooltipWhen.textContent =
      diffDays === 0
        ? 'Hoy'
        : diffDays > 0
          ? `Dentro de ~${formatInt(diffSecs)} segundos (${formatInt(diffDays)} días)`
          : `Hace ~${formatInt(diffSecs)} segundos (${formatInt(-diffDays)} días)`;
    tooltipPhrase.textContent = phraseFor(pick.day, {
      today: w.today,
      birthDay: w.life.birthDay,
      lastDay: w.life.retireDay - 1,
      isWorkday: w.life.isWorkday,
    });
    tooltipYear.textContent = `Año ${pick.year}`;
    tooltipYear.hidden = !layersOn;
  }
  tooltipMilestone.hidden = true;
  tooltipEl.hidden = false;
  const rect = tooltipEl.getBoundingClientRect();
  let left = cssX + 14;
  let top = cssY + 14;
  if (left + rect.width > window.innerWidth - 8) left = cssX - rect.width - 14;
  if (top + rect.height > window.innerHeight - 8) top = cssY - rect.height - 14;
  tooltipEl.style.left = `${Math.max(8, left)}px`;
  tooltipEl.style.top = `${Math.max(8, top)}px`;
}

function hideTooltip(): void {
  tooltipEl.hidden = true;
  selectedId = -1;
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideTooltip();
});

// ---------------------------------------------------------------- capas por años

function applyPalette(w: World): void {
  w.colors = layersOn ? w.layers.colors : w.sandColors;
  if (!w.renderer) return;
  if (layersOn) w.renderer.setColors(w.colors, w.layers.dim, w.layers.yearOf);
  else w.renderer.setColors(w.colors, w.sandDim);
}

/**
 * Los granos de una capa: «Año 2040: 252 días laborables», «De 11:00 a 12:00: quedan 1.234 de
 * sus 3.600 segundos de trabajo», o cuántos quedan de la capa en curso.
 */
function yearSummary(w: World, group: number): string {
  const total = w.layers.counts.get(group) ?? 0;
  const first = w.layers.first.get(group) ?? 0;
  const ahead = Math.max(0, Math.min(total, first + total - Math.max(first, w.landed)));
  const name = groupLabel(w.grains, group);
  const grains = unitPlural(total, w.unit);
  if (ahead === 0) return `${name}: ${grains}, ya ${UNIT_NAMES[w.unit].done}`;
  if (ahead === total) return `${name}: ${grains}`;
  return `${name}: quedan ${formatInt(ahead)} de sus ${grains}`;
}

/** Cuándo cae (o cayó) un grano, contado desde hoy (o desde el día que se reproduce). */
function whenText(w: World, id: number): string {
  return grainWhen(w.grains, w.life, id, w.target, w.today, new Date());
}

// ---------------------------------------------------------------- lupa

/** Lupa al pasar el ratón: posición (CSS) y grano señalado, o null. */
let lens: { x: number; y: number; id: number } | null = null;
/** Tras un clic la lupa se aparta, para leer la frase, hasta que el ratón se aleja un poco. */
let lensAway: { x: number; y: number } | null = null;

function showLens(w: World, id: number, cssX: number, cssY: number): void {
  lens = { x: cssX, y: cssY, id };
  hoverYear = layersOn && id >= 0 ? w.layers.yearOf[id] : -1;
  if (id < 0) {
    lensLabel.hidden = true;
    return;
  }
  const date = document.createElement('strong');
  date.textContent = grainTitle(w.grains, id);
  const when = document.createElement('span');
  when.className = 'cuando';
  when.textContent = whenText(w, id);
  lensLabel.replaceChildren(date, when);
  if (layersOn && w.unit !== 'anios') {
    const year = document.createElement('span');
    year.textContent = yearSummary(w, w.layers.yearOf[id]);
    lensLabel.append(year);
  }
  lensLabel.hidden = false;
  const rect = lensLabel.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, cssX - rect.width / 2));
  let top = cssY + LENS_RADIUS + 10;
  if (top + rect.height > window.innerHeight - 8) top = cssY - LENS_RADIUS - 10 - rect.height;
  lensLabel.style.left = `${left}px`;
  lensLabel.style.top = `${Math.max(8, top)}px`;
}

function hideLens(): void {
  lens = null;
  lensLabel.hidden = true;
  hoverYear = -1;
}

let hintTimer = 0;
let userInteracted = false;

function dismissHint(): void {
  clearTimeout(hintTimer);
  hintEl.hidden = true;
  countdownEl.hidden = false;
}

function showHint(text: string, ms = 7000): void {
  hintEl.textContent = text;
  hintEl.hidden = false;
  countdownEl.hidden = true;
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(dismissHint, ms);
}

function updateSortButton(): void {
  const w = world;
  if (w?.altView instanceof CoinsView) {
    const messy = w.altView.hasMessyCoins();
    sortBtn.hidden = !messy;
    sortBtn.disabled = false;
    sortBtn.textContent = 'Apilar monedas';
    return;
  }
  sortBtn.hidden = !layersOn || !!w?.altView;
  if (!w?.sim?.sorting) {
    sortBtn.disabled = false;
    sortBtn.textContent = 'Ordenar capas';
  }
}

function setLayers(on: boolean): void {
  layersOn = on;
  saveLayers(on);
  layersBtn.setAttribute('aria-pressed', String(on));
  updateSortButton();
  hideTooltip();
  hideLens();
  if (world) applyPalette(world);
  if (on) {
    const target =
      unit === 'nominas'
        ? 'una moneda'
        : unit === 'anios'
          ? 'un anillo'
          : unit === 'segundos'
            ? 'el agua'
            : 'la arena';
    showHint(`Cada color es un año · pasa por encima o toca ${target} para ver cuál`);
  }
}

layersBtn.setAttribute('aria-pressed', String(layersOn));
layersBtn.addEventListener('click', () => {
  setLayers(!layersOn);
  menu.open = false;
});
sortBtn.hidden = !layersOn;

/** Reordena los granos por fecha o vuelve a apilar las monedas desordenadas. */
function startSort(): void {
  const w = world;
  if (!w) return;
  if (w.altView instanceof CoinsView) {
    hideTooltip();
    w.altView.tidy();
    updateSortButton();
    return;
  }
  if (!w.sim || w.sim.sorting) return;
  hideTooltip();
  w.sim.startSort();
  sortBtn.disabled = true;
  sortBtn.textContent = 'Ordenando…';
}

function endSort(): void {
  updateSortButton();
}

sortBtn.addEventListener('click', startSort);

// ---------------------------------------------------------------- tocar y remover la arena

interface Press {
  pointerId: number;
  x0: number;
  y0: number;
  /** Última posición en la rejilla. */
  last: Point;
  dragging: boolean;
  touch: boolean;
  /** Giro del reloj al empezar a arrastrar con el ratón. */
  angle0: number;
}

/** Distancia en px a partir de la cual un toque pasa a ser un arrastre. */
const DRAG_START_PX = 6;
let press: Press | null = null;
let finger: (Point & { r: number }) | null = null;

/** Radio del dedo en celdas: unos 11 px con ratón y 18 px con el dedo. */
function fingerRadius(w: World, touch: boolean): number {
  const { dpr, s } = w.renderer!;
  return Math.max(1.5, Math.min(28, ((touch ? 18 : 11) * dpr) / s));
}

/** Remueve la arena a lo largo del trazo, en pasos de medio radio para no dejar huecos. */
function digAlong(w: World, a: Point, b: Point, r: number): void {
  if (!w.sim) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.min(40, Math.max(1, Math.ceil(Math.hypot(dx, dy) / (r * 0.5))));
  for (let i = 1; i <= steps; i++) dugSinceFrame += w.sim.dig(a.x + (dx * i) / steps, a.y + (dy * i) / steps, r, dx, dy);
}

canvas.addEventListener('pointerdown', (e) => {
  askMotionPermission();
  userInteracted = true;
  dismissHint();
  const w = world;
  if (!w || (e.pointerType === 'mouse' && e.button !== 0)) return;
  press = {
    pointerId: e.pointerId,
    x0: e.clientX,
    y0: e.clientY,
    last: w.renderer ? w.renderer.toGrid(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY },
    dragging: false,
    touch: e.pointerType !== 'mouse',
    angle0: viewAngle,
  };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Sin captura el arrastre se corta al salir del lienzo; no pasa nada.
  }
});

canvas.addEventListener('pointermove', (e) => {
  const w = world;
  if (!w) return;
  // En vistas alternativas (clepsidra en segundos, monedas 3D en nóminas, anillos de árbol en años).
  if (w.altView) {
    if (press && e.pointerId === press.pointerId && w.altView instanceof CoinsView) {
      if (!press.dragging) {
        if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_START_PX) return;
        press.dragging = true;
        hideTooltip();
        hoverAltId = -1;
        canvas.classList.add('removiendo');
        w.altView.beginDrag(press.x0, press.y0);
        press.last = { x: press.x0, y: press.y0 };
      }
      w.altView.moveDrag(e.clientX, e.clientY, e.clientX - press.last.x, e.clientY - press.last.y);
      press.last = { x: e.clientX, y: e.clientY };
      return;
    }
    if (press && e.pointerId === press.pointerId && w.altView instanceof ClepsydraView) {
      if (!press.dragging) {
        if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_START_PX) return;
        press.dragging = true;
        hideTooltip();
        canvas.classList.add('removiendo');
        w.altView.beginTilt();
        press.last = { x: press.x0, y: press.y0 };
      }
      w.altView.dragTilt(e.clientX - press.x0, e.clientX - press.last.x);
      press.last = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerType === 'mouse') {
      if (w.altView instanceof ClepsydraView) {
        const info = w.altView.pickInfo(e.clientX, e.clientY);
        hoverYear = layersOn && info?.kind === 'day' ? info.year : -1;
        canvas.classList.toggle('moneda-cogible', !!info);
      } else {
        const id = w.altView.pick(e.clientX, e.clientY);
        hoverAltId = id;
        hoverYear = layersOn && id >= 0 ? w.layers.yearOf[id] : -1;
        canvas.classList.toggle('moneda-cogible', w.altView instanceof CoinsView && id >= 0);
      }
    }
    return;
  }
  if (!w.renderer) return;
  if (press && e.pointerId === press.pointerId) {
    if (!press.dragging) {
      if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_START_PX) return;
      press.dragging = true;
      hideTooltip();
      hideLens();
      canvas.classList.add('removiendo');
      if (!press.touch) {
        tilting = true;
        spinStart = -1;
      }
    }
    if (!press.touch) {
      // Con el ratón se coge el reloj y se inclina: medio grado por píxel, hasta 150°.
      tiltTarget = Math.max(-2.6, Math.min(2.6, press.angle0 + (e.clientX - press.x0) * (Math.PI / 360)));
      return;
    }
    const p = w.renderer.toGrid(e.clientX, e.clientY);
    const r = fingerRadius(w, press.touch);
    digAlong(w, press.last, p, r);
    press.last = p;
    finger = { ...p, r };
    return;
  }
  if (e.pointerType !== 'mouse') return;
  // Con el reloj girado, la lupa estorbaría; con canicas grandes, no hace falta.
  if (viewAngle !== 0 || spinStart >= 0 || w.renderer.marbles) {
    hideLens();
    return;
  }
  if (lensAway) {
    if (Math.hypot(e.clientX - lensAway.x, e.clientY - lensAway.y) < 24) return;
    lensAway = null;
    hideTooltip();
  }
  const b = w.renderer.bounds();
  const inside = e.clientX >= b.left - 20 && e.clientX <= b.right + 20 && e.clientY >= b.top && e.clientY <= b.bottom;
  if (!inside) {
    hideLens();
    return;
  }
  showLens(w, pickGrain(w, e.clientX, e.clientY, false), e.clientX, e.clientY);
});

function endPress(e: PointerEvent, tap: boolean): void {
  if (!press || e.pointerId !== press.pointerId) return;
  const p = press;
  press = null;
  finger = null;
  tilting = false;
  canvas.classList.remove('removiendo');
  const w = world;
  if (w?.altView instanceof CoinsView && p.dragging) {
    w.altView.endDrag();
    updateSortButton();
    return;
  }
  if (w?.altView instanceof ClepsydraView && p.dragging) {
    w.altView.endTilt();
    return;
  }
  if (!w || !tap || p.dragging) return;
  if (w.altView instanceof ClepsydraView) {
    const info = w.altView.pickInfo(p.x0, p.y0);
    if (!info) hideTooltip();
    else showClepsydraTooltip(w, info, p.x0, p.y0);
    return;
  }
  // Un toque sin arrastre: muestra el grano, moneda o anillo que hay debajo.
  const id = pickGrain(w, p.x0, p.y0, p.touch);
  if (id < 0) {
    hideTooltip();
    return;
  }
  selectedId = id;
  if (!p.touch && !w.altView) {
    hideLens();
    lensAway = { x: p.x0, y: p.y0 };
  }
  showTooltip(w, id, p.x0, p.y0);
}

canvas.addEventListener('pointerup', (e) => endPress(e, true));
// Doble clic: vuelta completa en el reloj de arena, olas en la clepsidra o apilar/sacudir monedas.
canvas.addEventListener('dblclick', () => {
  if (!world || reducedMotion) return;
  if (world.altView instanceof CoinsView) {
    hideTooltip();
    if (world.altView.hasMessyCoins()) world.altView.tidy();
    else world.altView.tremor(1);
    updateSortButton();
    return;
  }
  if (world.altView instanceof ClepsydraView) {
    hideTooltip();
    world.altView.tremor(1);
    return;
  }
  if (!world.sim) return;
  hideTooltip();
  tilting = false;
  spinStart = performance.now();
});

// ---------------------------------------------------------------- inclinar con el ratón

/** Giro del reloj en pantalla (rad, sentido horario). La gravedad de la arena lo sigue. */
let viewAngle = 0;
let tiltTarget = 0;
let tilting = false;
/** Inicio de la vuelta completa del doble clic, o -1. */
let spinStart = -1;
const SPIN_MS = 1800;
let lastTiltWake = 0;

function updateTilt(w: World, now: number): void {
  if (!w.sim) return;
  if (spinStart >= 0) {
    const p = Math.min(1, (now - spinStart) / SPIN_MS);
    const ease = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    viewAngle = ease * 2 * Math.PI;
    if (p >= 1) {
      spinStart = -1;
      viewAngle = 0;
    }
  } else if (tilting) {
    viewAngle += (tiltTarget - viewAngle) * 0.25;
  } else if (viewAngle !== 0) {
    // Al soltarlo, vuelve despacio a su sitio.
    viewAngle = reducedMotion || Math.abs(viewAngle) < 0.002 ? 0 : viewAngle * 0.92;
  } else return;
  const moved = Math.abs(angleDelta(w.sim.gravityAngle, viewAngle));
  w.sim.gravityAngle = viewAngle;
  if (moved > 0.02 && now - lastTiltWake > 120) {
    w.sim.wakeAll();
    lastTiltWake = now;
  }
}
canvas.addEventListener('pointercancel', (e) => endPress(e, false));
canvas.addEventListener('pointerleave', () => {
  hoverAltId = -1;
  canvas.classList.remove('moneda-cogible');
  if (!press) hideLens();
});

// ---------------------------------------------------------------- contador

let lastCounterKey = '';
function updateCounter(): void {
  const w = world;
  if (!w) {
    counterEl.replaceChildren();
    lastCounterKey = '';
    return;
  }
  const { remaining, done, fraction } = remainingNow(w);
  const pct = formatPercent(fraction);
  const primaryText =
    remaining <= 0
      ? '¡Jubilación!'
      : `${remaining === 1 ? 'Queda' : 'Quedan'} ${unitPlural(remaining, w.unit)}`;
  const secondaryText = `· llevas ${formatInt(done)} · ${pct}`;
  const key = `${primaryText}|${secondaryText}`;
  if (key === lastCounterKey) return;
  lastCounterKey = key;

  let mainSpan = counterEl.querySelector<HTMLSpanElement>('.cifra-principal');
  let secSpan = counterEl.querySelector<HTMLSpanElement>('.cifra-sec');
  if (!mainSpan || !secSpan) {
    mainSpan = document.createElement('span');
    mainSpan.className = 'cifra-principal';
    secSpan = document.createElement('span');
    secSpan.className = 'cifra-sec';
    counterEl.replaceChildren(mainSpan, secSpan);
  }
  if (mainSpan.textContent !== primaryText) mainSpan.textContent = primaryText;
  if (secSpan.textContent !== secondaryText) secSpan.textContent = secondaryText;
}

/**
 * Lo que queda hasta la jubilación en la unidad del reloj. En segundos se cuentan los de toda
 * la vida laboral (el reloj solo muestra la jornada de hoy); en las demás, los granos de arriba.
 */
function remainingNow(w: World): { remaining: number; done: number; fraction: number } {
  if (w.unit === 'segundos') {
    const ls = play ? lifeSecondsAtDay(w.life, play.day) : lifeSeconds(w.life, new Date());
    return { remaining: ls.left, done: ls.done, fraction: ls.fraction };
  }
  return { remaining: w.grains.total - w.landed, done: w.landed, fraction: w.landed / w.grains.total };
}

// ---------------------------------------------------------------- ajustes

const regionSelect = form.elements.namedItem('region') as HTMLSelectElement;
const regionNote = $('nota-comunidad');
for (const reg of REGIONS) {
  const opt = document.createElement('option');
  opt.value = reg.id;
  opt.textContent = reg.name;
  regionSelect.append(opt);
}

function updateRegionNote(regionId: string): void {
  const reg = regionById(regionId);
  if (reg) {
    regionNote.textContent = regionSummary(reg);
    regionNote.hidden = false;
  } else {
    regionNote.textContent = '';
    regionNote.hidden = true;
  }
}

regionSelect.addEventListener('change', () => {
  const reg = regionById(regionSelect.value);
  if (reg) {
    const f = form.elements as unknown as Record<string, HTMLInputElement>;
    f.holyThursday.checked = reg.holyThursday;
    f.easterMonday.checked = reg.easterMonday;
  }
  updateRegionNote(regionSelect.value);
});

function openSettings(): void {
  const cfg = isDemoConfig ? null : (world?.cfg ?? loadConfig());
  const f = form.elements as unknown as Record<string, HTMLInputElement>;
  f.birthDate.value = cfg?.birthDate ?? '';
  f.retirementAge.value = String(cfg?.retirementAge ?? 67);
  f.workStartDate.value = cfg?.workStartDate ?? '';
  regionSelect.value = cfg?.region ?? '';
  updateRegionNote(regionSelect.value);
  f.holyThursday.checked = cfg?.holyThursday ?? true;
  f.easterMonday.checked = cfg?.easterMonday ?? false;
  f.extraHolidays.value = cfg?.extraHolidays ?? '';
  f.pagas.value = String(cfg?.pagas === 12 ? 12 : 14);
  f.jornadaInicio.value = cfg?.jornadaInicio || '09:00';
  f.jornadaFin.value = cfg?.jornadaFin || '18:00';
  f.comidaInicio.value = cfg?.comidaInicio ?? '14:00';
  f.comidaFin.value = cfg?.comidaFin ?? '15:00';
  formError.textContent = '';
  cancelBtn.hidden = !world;
  dialog.showModal();
}

$('btn-ajustes').addEventListener('click', openSettings);
customBtn.addEventListener('click', openSettings);

// El menú de páginas se cierra al tocar fuera o con Escape.
const menu = $('menu') as HTMLDetailsElement;
document.addEventListener('pointerdown', (e) => {
  if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') menu.open = false;
});
cancelBtn.addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', (e) => {
  if (!world) e.preventDefault();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = form.elements as unknown as Record<string, HTMLInputElement>;
  const cfg: LifeConfig = {
    birthDate: f.birthDate.value,
    retirementAge: Number(f.retirementAge.value),
    workStartDate: f.workStartDate.value,
    region: regionSelect.value || undefined,
    holyThursday: f.holyThursday.checked,
    easterMonday: f.easterMonday.checked,
    extraHolidays: f.extraHolidays.value.trim(),
    pagas: Number(f.pagas.value) === 12 ? 12 : 14,
    jornadaInicio: f.jornadaInicio.value,
    jornadaFin: f.jornadaFin.value,
    comidaInicio: f.comidaInicio.value,
    comidaFin: f.comidaFin.value,
  };
  const jornada = jornadaFor(cfg);
  const error = validateConfig(cfg) ?? (typeof jornada === 'string' ? jornada : null);
  if (error) {
    formError.textContent = error;
    return;
  }
  isDemoConfig = false;
  customBtn.hidden = true;
  saveConfig(cfg);
  createWorld(cfg);
  dialog.close();
});

// ---------------------------------------------------------------- hitos

function celebrate(w: World, m: Milestone): void {
  milestoneTitle.textContent = m.title;
  milestoneDate.textContent = grainTitle(w.grains, m.id);
  // Reproduciendo, el aviso sale justo debajo del panel de reproducción en vez de detrás.
  milestoneEl.classList.toggle('en-reproduccion', !!play);
  // (La animación de entrada lo sube 12 px: se deja margen para que no roce el panel.)
  milestoneEl.style.top = play ? `${Math.round(playPanel.getBoundingClientRect().bottom + 22)}px` : '';
  // Volver a mostrarlo reinicia la animación de entrada.
  milestoneEl.hidden = true;
  void milestoneEl.offsetWidth;
  milestoneEl.hidden = false;
  clearTimeout(milestoneTimer);
  milestoneTimer = window.setTimeout(() => (milestoneEl.hidden = true), 7000);
  sound.chime();
}
let milestoneTimer = 0;

/** Quita el aviso de hito que haya en pantalla. */
function hideMilestone(): void {
  clearTimeout(milestoneTimer);
  milestoneEl.hidden = true;
}

/** IDs de los tres próximos hitos (para el árbol y las monedas). */
function nextMilestoneIds(w: World): number[] {
  const out: number[] = [];
  for (const m of w.milestones) {
    if (m.id < w.landed) continue;
    out.push(m.id);
    if (out.length === 3) break;
  }
  return out;
}

/** Posición de los tres próximos hitos, para que brillen (todos a la vez serían demasiados). */
function milestoneMarks(w: World): Point[] {
  if (!w.sim) return [];
  const out: Point[] = [];
  for (const m of w.milestones) {
    if (m.id < w.landed) continue;
    if (out.length === 3) break;
    const p = w.sim.pointOf(m.id);
    if (p) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- cuenta atrás

function updateCountdown(): void {
  const w = world;
  let line = '';
  if (w && !play) {
    if (w.unit === 'segundos') {
      const now = new Date();
      const { left: workLeft } = careerSeconds(w.life, w.grains.window!.jornada, now);
      line =
        Math.floor(Date.now() / 8000) % 2 === 0
          ? `De jornada laboral: quedan ${formatInt(workLeft)} segundos de trabajo`
          : 'Cada gota es un segundo de tu vida laboral · 24 h al día';
    } else {
      line = unitCountdown(w.grains, w.life, new Date()) ?? '';
      // Cada 8 s se alterna con el próximo hito.
      const next = nextMilestone(w.milestones, w.landed);
      if (next && Math.floor(Date.now() / 8000) % 2 === 1) {
        const n = next.id + 1 - w.landed;
        const when = `dentro de ${unitPlural(n, w.unit)}`;
        line = n === 1 ? `Próximo hito: ${next.short}, con el próximo grano` : `Próximo hito: ${next.short}, ${when}`;
      }
    }
  }
  if (countdownEl.textContent !== line) countdownEl.textContent = line;
}

// ---------------------------------------------------------------- sonido

const sound = new SandSound();
let soundOn = loadSound();
sound.enabled = soundOn;
function syncSoundBtn(): void {
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  const label = soundOn ? 'Silenciar sonido' : 'Activar sonido';
  soundBtn.setAttribute('aria-label', label);
  soundBtn.dataset.tooltip = label;
}
syncSoundBtn();
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  saveSound(soundOn);
  syncSoundBtn();
  sound.setEnabled(soundOn);
  if (soundOn) window.setTimeout(() => sound.tink(0.6), 60);
});
// El navegador solo deja sonar después de un gesto del usuario.
document.addEventListener('pointerdown', () => sound.unlock());
document.addEventListener('keydown', () => sound.unlock());
/** Granos movidos con el dedo desde el último fotograma, para el siseo. */
let dugSinceFrame = 0;

// ---------------------------------------------------------------- ¿y si me jubilo a otra edad?

/** Los granos con id >= ageCutoff se ven transparentes mientras el panel está abierto. */
let ageCutoff = -1;
/** Fracción de corte en la clepsidra (segundos) cuando se previsualiza otra edad de jubilación. */
let ageCutoffFraction = -1;

function openAgePanel(): void {
  const w = world;
  if (!w || play) return;
  const cur = w.cfg.retirementAge;
  ageInput.min = String(Math.max(40, Math.min(60, cur)));
  ageInput.max = String(Math.min(90, Math.max(70, cur)));
  ageInput.value = String(cur);
  agePanel.hidden = false;
  ageBtn.setAttribute('aria-expanded', 'true');
  hideTooltip();
  updateAgePreview();
}

function closeAgePanel(): void {
  agePanel.hidden = true;
  ageBtn.setAttribute('aria-expanded', 'false');
  ageCutoff = -1;
  ageCutoffFraction = -1;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function updateAgePreview(): void {
  const w = world;
  if (!w) return;
  const age = Number(ageInput.value);
  ageValue.textContent = String(age);
  const cfg: LifeConfig = { ...w.cfg, retirementAge: age };
  const error = validateConfig(cfg);
  if (error) {
    ageText.textContent = error;
    ageUse.disabled = true;
    ageCutoff = -1;
    ageCutoffFraction = -1;
    return;
  }
  const life = buildLife(cfg);
  if (w.unit === 'segundos') {
    const now = new Date();
    const curSecs = lifeSeconds(w.life, now);
    const altSecs = lifeSeconds(life, now);
    const when = `Te jubilarías el ${lowerFirst(formatDayLong(life.retireDay))}.`;
    if (altSecs.left <= 0) {
      ageText.textContent = `A los ${age} ya te habrías jubilado: toda el agua de arriba sobraría.`;
      ageUse.disabled = true;
      ageCutoffFraction = curSecs.fraction;
      return;
    }
    const diff = altSecs.total - curSecs.total;
    ageUse.disabled = age === w.cfg.retirementAge;
    ageCutoffFraction = diff < 0 ? altSecs.total / curSecs.total : -1;
    const ahead = `${formatInt(altSecs.left)} segundos por delante`;
    if (diff === 0) ageText.textContent = `${ahead}. Es tu edad actual. ${when}`;
    else if (diff < 0) ageText.textContent = `${ahead}: ${formatInt(-diff)} menos. La zona atenuada es lo que te ahorrarías. ${when}`;
    else ageText.textContent = `${ahead}: ${formatInt(diff)} más. ${when}`;
    return;
  }
  const alt = buildGrains(life, cfg, w.unit);
  if (fallenAtDay(alt, w.today) >= alt.total) {
    ageText.textContent = `A los ${age} ya te habrías jubilado: toda la arena de arriba sobraría.`;
    ageUse.disabled = true;
    ageCutoff = w.landed;
    return;
  }
  const ahead = alt.total - w.landed;
  const diff = alt.total - w.grains.total;
  const when = `Te jubilarías el ${lowerFirst(formatDayLong(life.retireDay))}.`;
  ageUse.disabled = age === w.cfg.retirementAge;
  ageCutoff = diff < 0 ? alt.total : -1;
  const days = `${unitPlural(ahead, w.unit)} por delante`;
  if (diff === 0) ageText.textContent = `${days}. Es tu edad actual. ${when}`;
  else if (diff < 0) {
    ageText.textContent = `${days}: ${formatInt(-diff)} menos. Los granos transparentes son los que te ahorrarías. ${when}`;
  } else ageText.textContent = `${days}: ${formatInt(diff)} más. ${when}`;
}

ageBtn.addEventListener('click', () => (agePanel.hidden ? openAgePanel() : closeAgePanel()));
ageClose.addEventListener('click', closeAgePanel);
ageInput.addEventListener('input', updateAgePreview);
$('btn-edad-calendario').addEventListener('click', () => {
  const w = world;
  if (!w) return;
  const age = Number(ageInput.value);
  const cfg: LifeConfig = { ...w.cfg, retirementAge: age };
  if (validateConfig(cfg)) return;
  downloadRetirementIcs(buildLife(cfg), age);
});
ageUse.addEventListener('click', () => {
  const w = world;
  if (!w) return;
  const cfg: LifeConfig = { ...w.cfg, retirementAge: Number(ageInput.value) };
  if (validateConfig(cfg)) return;
  saveConfig(cfg);
  closeAgePanel();
  createWorld(cfg);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !agePanel.hidden) closeAgePanel();
});

// ---------------------------------------------------------------- compartir

let shareFile: File | null = null;
let shareUrl = '';
let shareMessage = '';

function openShare(): void {
  const w = world;
  // Compartiría una fecha que no es la de hoy.
  if (!w || play) return;
  hideTooltip();
  closeAgePanel();
  const { remaining, fraction } = remainingNow(w);
  const names = UNIT_NAMES[w.unit];
  const info = {
    remaining: formatInt(remaining),
    what: remaining === 1 ? names.one : names.many,
    percent: formatPercent(fraction),
    fraction,
  };
  let clock: HTMLCanvasElement;
  if (w.altView instanceof ClepsydraView) {
    const ls = lifeSeconds(w.life, new Date());
    const cFrame: ClepsydraFrame = {
      time: performance.now(),
      fraction: ls.fraction,
      doneSec: ls.done,
      totalSec: ls.total,
      subSec: 0.65,
      playSpeed: 0,
      layersOn,
      highlightYear: -1,
      cutoffFraction: -1,
      reducedMotion: true,
    };
    clock = w.altView.snapshot(CLOCK_SIZE.width, CLOCK_SIZE.height, cFrame).canvas;
  } else if (w.altView) {
    const altFrame: AltFrame = {
      time: performance.now(),
      landed: w.landed,
      selected: -1,
      hovered: -1,
      layersOn,
      highlightYear: -1,
      cutoff: -1,
      milestoneIds: [],
      reducedMotion: true,
    };
    clock = w.altView.snapshot(CLOCK_SIZE.width, CLOCK_SIZE.height, altFrame).canvas;
  } else {
    const frame = { time: performance.now(), heroes: [], today: null, selected: null, highlight: -1, cutoff: -1, marks: [], finger: null };
    clock = w.renderer!.snapshot(CLOCK_SIZE.width, CLOCK_SIZE.height, frame).canvas;
  }
  const card = drawCard(clock, info);
  shareMessage = `${shareText(info)} ${SHARE_URL}`;
  shareStatus.textContent = '';
  toBlob(card).then((blob) => {
    if (!blob) return;
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    shareUrl = URL.createObjectURL(blob);
    shareFile = new File([blob], 'mi-reloj-de-jubilacion.png', { type: 'image/png' });
    shareImg.src = shareUrl;
    shareDownload.href = shareUrl;
    // El menú del sistema (móviles, Windows…) solo si el navegador sabe compartir imágenes.
    const canShare = !!navigator.canShare?.({ files: [shareFile] });
    shareSystem.hidden = !canShare;
    shareDownload.classList.toggle('primario', !canShare);
    shareDownload.classList.toggle('secundario', canShare);
    shareDialog.showModal();
  });
}

shareBtn.addEventListener('click', () => {
  menu.open = false;
  openShare();
});
shareSystem.addEventListener('click', () => {
  if (!shareFile) return;
  navigator.share({ files: [shareFile], text: shareMessage }).catch(() => undefined);
});
shareCopy.addEventListener('click', () => {
  navigator.clipboard
    ?.writeText(shareMessage)
    .then(() => (shareStatus.textContent = 'Texto copiado. Pégalo junto a la imagen.'))
    .catch(() => (shareStatus.textContent = shareMessage));
});
$('btn-compartir-calendario').addEventListener('click', () => {
  const w = world;
  if (!w) return;
  downloadRetirementIcs(w.life, w.cfg.retirementAge);
  shareStatus.textContent = 'Evento de calendario (.ics) descargado.';
});
shareClose.addEventListener('click', () => shareDialog.close());

// ---------------------------------------------------------------- reproducir el paso del tiempo

/** Velocidades: días de calendario por segundo y cómo se dicen. */
const SPEEDS: ReadonlyArray<[number, string]> = [
  [1, '1 día por segundo'],
  [7, '1 semana por segundo'],
  [30.44, '1 mes por segundo'],
  [91.31, '3 meses por segundo'],
  [365.25, '1 año por segundo'],
  [1826, '5 años por segundo'],
];
let speedIdx = 2;

interface Play {
  /** Día reproducido (día civil, con decimales: la hora del día). */
  day: number;
  paused: boolean;
  /** Ha llegado a la jubilación. */
  done: boolean;
  lastFrame: number;
  /** Último hito celebrado durante la reproducción. */
  celebrated: number;
}
/** Reproducción en curso, o null con el reloj en tiempo real. Nada de lo reproducido se guarda. */
let play: Play | null = null;
/** Espacio que se deja arriba para el panel de reproducción. */
let topExtra = 0;
let lastPlayDay = -1;

function setTopExtra(px: number): void {
  topExtra = px;
  if (world?.renderer) {
    world.renderer.topExtra = px;
    world.renderer.resize();
  }
  if (world?.altView) {
    world.altView.topExtra = px;
    world.altView.resize();
  }
}

function openPlayPanel(): void {
  playPanel.hidden = false;
  playBtn.hidden = true;
  lastPlayDay = -1;
  // El reloj se encoge un poco para que el panel no tape la arena de arriba.
  setTopExtra(Math.ceil(playPanel.getBoundingClientRect().bottom - 56 + 6));
}

function startPlay(fromStart: boolean): void {
  const w = world;
  if (!w) return;
  hideTooltip();
  hideLens();
  closeAgePanel();
  const now = performance.now();
  if (play) hideMilestone();
  play = { day: fromStart ? w.life.startDay : localDayNumber(), paused: false, done: false, lastFrame: now, celebrated: -1 };
  openPlayPanel();
  // Desde el principio: todo arriba, como el primer día de tu vida laboral.
  if (fromStart) createWorld(w.cfg, 0);
  updatePlayControls();
}

function exitPlay(): void {
  if (!play) return;
  play = null;
  // Los avisos de la reproducción no son reales: desaparecen con ella.
  hideMilestone();
  playPanel.hidden = true;
  playBtn.hidden = false;
  setTopExtra(0);
  // Vuelve el reloj real, tal como estaba guardado.
  const cfg = world?.cfg ?? loadConfig();
  if (cfg) createWorld(cfg);
}

function togglePause(): void {
  if (!play) return;
  if (play.done) startPlay(true);
  else play.paused = !play.paused;
  updatePlayControls();
}

function updatePlayControls(): void {
  const stopped = !play || play.paused || play.done;
  playPause.classList.toggle('pausado', stopped);
  const label = play?.done ? 'Otra vez desde el principio' : stopped ? 'Seguir' : 'Pausa';
  playPause.setAttribute('aria-label', label);
  playPause.title = label;
  playSpeedLabel.textContent = SPEEDS[speedIdx][1];
}

/** Avanza el día reproducido y deja que caigan los granos de los periodos que terminan. */
function updatePlay(w: World, now: number): void {
  if (!play) return;
  // Si la pestaña estuvo sin fotogramas, no se saltan años de golpe.
  const dt = Math.max(0, Math.min(100, now - play.lastFrame));
  play.lastFrame = now;
  if (!play.paused && !play.done) {
    play.day += (dt / 1000) * SPEEDS[speedIdx][0];
    if (play.day >= w.life.retireDay) {
      play.day = w.life.retireDay;
      play.done = true;
      updatePlayControls();
    }
  }
  const day = Math.floor(play.day);
  // Las fechas de los granos («dentro de…», «hoy») se cuentan desde el día reproducido.
  w.today = day;
  w.target = fallenAtDay(w.grains, day);
  if (day !== lastPlayDay) {
    lastPlayDay = day;
    playDate.textContent = formatDayLong(day);
  }
  const status = play.done
    ? '¡Jubilación! Con ▶ lo ves otra vez desde el principio.'
    : play.paused
      ? 'En pausa.'
      : 'Nada de esto se guarda: con × vuelves a hoy.';
  if (playStatus.textContent !== status) playStatus.textContent = status;
}

/** Durante la reproducción, cae enseguida cada grano cuyo día ha terminado. */
function spawnPlayGrains(w: World, now: number): void {
  const speed = SPEEDS[speedIdx][0];
  const fallMs = reducedMotion ? 0 : speed <= 1 ? 1100 : speed <= 7 ? 800 : 520;
  const bright = speed <= 7 ? 0.8 : 0;
  // Tumbado o boca abajo no pasa nada por el cuello; al enderezarlo sale lo acumulado.
  if (!neckFlows(w)) return;
  let budget = 80;
  while (w.nextDrop < w.target && budget-- > 0) {
    const h = spawnHero(w, now, 0, fallMs, bright);
    if (!h) break;
    if (reducedMotion) {
      w.heroes.pop();
      landHero(w, h);
    }
  }
}

playBtn.addEventListener('click', () => startPlay(false));
playStart.addEventListener('click', () => startPlay(true));
playPause.addEventListener('click', togglePause);
playClose.addEventListener('click', exitPlay);
playSpeed.addEventListener('input', () => {
  speedIdx = Number(playSpeed.value);
  updatePlayControls();
});
document.addEventListener('keydown', (e) => {
  if (!play || dialog.open || shareDialog.open) return;
  const target = e.target as HTMLElement;
  if (e.key === ' ' && (target === document.body || target === canvas)) {
    e.preventDefault();
    togglePause();
  } else if (e.key === 'Escape') exitPlay();
});

// ---------------------------------------------------------------- bucle

const showFps = new URLSearchParams(location.search).has('fps');
fpsEl.hidden = !showFps;
let fps = 0;
let fpsFrames = 0;
let fpsSince = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  tick(now);
}

let lastShownLifeSec = -1;

function tick(now: number): void {
  fpsFrames++;
  if (now - fpsSince >= 1000) {
    fps = (fpsFrames * 1000) / (now - fpsSince);
    fpsFrames = 0;
    fpsSince = now;
    if (showFps && world) fpsEl.textContent = `${fps.toFixed(0)} fps · ${world.sim?.activeCount ?? 0} activos`;
  }

  const w = world;
  if (!w) return;
  updatePlay(w, now);
  // Un aviso de la reproducción nunca sobrevive a ella.
  if (!play && !milestoneEl.hidden && milestoneEl.classList.contains('en-reproduccion')) hideMilestone();

  // Clepsidra de cristal (segundos naturales 24/7 de toda la vida laboral).
  if (w.altView instanceof ClepsydraView) {
    sound.setActivity(0);
    canvas.classList.remove('con-lupa');
    const ls = play ? lifeSecondsAtDay(w.life, play.day) : lifeSeconds(w.life, new Date());
    if (ls.done !== lastShownLifeSec) {
      lastShownLifeSec = ls.done;
      updateCounter();
    }
    const playSpeed = play && !play.paused && !play.done ? SPEEDS[speedIdx][0] : 0;
    w.altView.draw({
      time: now,
      fraction: ls.fraction,
      doneSec: ls.done,
      totalSec: ls.total,
      subSec: ls.subSec,
      playSpeed,
      layersOn,
      highlightYear: layersOn ? hoverYear : -1,
      cutoffFraction: ageCutoffFraction,
      reducedMotion,
    });
    return;
  }

  updateDrops(w, now);

  // Vistas alternativas (pilas de monedas 3D en nóminas, anillos de árbol en años).
  if (w.altView) {
    sound.setActivity(0);
    canvas.classList.remove('con-lupa');
    let highlightYear = -1;
    if (layersOn) {
      if (hoverYear >= 0) highlightYear = hoverYear;
      else if (selectedId >= 0) highlightYear = w.layers.yearOf[selectedId];
    }
    w.altView.draw({
      time: now,
      landed: w.landed,
      selected: selectedId,
      hovered: hoverAltId,
      layersOn,
      highlightYear,
      cutoff: ageCutoff,
      milestoneIds: nextMilestoneIds(w),
      reducedMotion,
    });
    return;
  }

  updateTilt(w, now);
  keepTodayAtNeck(w);

  const sim = w.sim!;
  sim.step();
  sim.step();
  if (sim.sorting) {
    // Unos 50 fotogramas: algo menos de un segundo.
    if (reducedMotion) while (sim.sortStep(1));
    else sim.sortStep(1 / 50);
    dugSinceFrame += 40;
    if (!sim.sorting) endSort();
  }
  sound.setActivity(sim.activeCount / 2500 + dugSinceFrame / 150);
  dugSinceFrame = 0;
  sim.agitation = sim.agitation > 0.02 ? sim.agitation * 0.9 : 0;
  sim.tilt = Math.abs(sim.tilt) > 0.02 ? sim.tilt * 0.93 : 0;

  const heroes: HeroDraw[] = w.heroes.map((h) => {
    const p = heroPoint(h);
    const glow = h.glowMs > 0 ? Math.min(1, (now - h.t0) / h.glowMs) : 1;
    return { ...p, color: unpackColor(w.colors[h.id]), glow: glow * h.bright };
  });

  let today: Point | null = null;
  if (w.unit !== 'segundos' && w.target < w.grains.total && w.nextDrop === w.target) today = sim.pointOf(w.target);

  let selected: Point | null = null;
  if (selectedId >= 0) {
    const hero = w.heroes.find((h) => h.id === selectedId);
    if (hero) selected = heroPoint(hero);
    else selected = sim.pointOf(selectedId);
  }

  let highlight = -1;
  if (layersOn) {
    if (hoverYear >= 0) highlight = hoverYear;
    else if (selectedId >= 0) highlight = w.layers.yearOf[selectedId];
  }

  let lensFrame = null;
  if (lens) {
    lensFrame = { x: lens.x, y: lens.y, grain: lens.id >= 0 ? sim.pointOf(lens.id) : null };
  }
  canvas.classList.toggle('con-lupa', !!lens);

  w.renderer!.draw({
    time: now,
    heroes,
    today: reducedMotion ? null : today,
    selected,
    highlight,
    finger,
    cutoff: ageCutoff,
    marks: milestoneMarks(w),
    rotation: viewAngle,
    lens: lensFrame,
  });
}

// ---------------------------------------------------------------- arranque

window.addEventListener('resize', () => {
  if (play) openPlayPanel();
  world?.renderer?.resize();
  world?.altView?.resize();
  hideTooltip();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  world?.renderer?.refreshTheme();
  world?.altView?.refreshTheme();
});
document.addEventListener('visibilitychange', () => {
  // Sin fotogramas en segundo plano, el siseo se quedaría sonando.
  if (document.visibilityState !== 'visible') sound.setActivity(0);
  if (document.visibilityState === 'visible') {
    checkDay();
    scheduleMidnight();
  }
});
window.setInterval(checkDay, 60_000);
window.setInterval(updateCountdown, 1000);
window.addEventListener('pagehide', () => world && persistProgress(world));
const unitBox = $('unidades');
const unitButtons = [...unitBox.querySelectorAll<HTMLButtonElement>('[data-unidad]')];

const unitHint = (u: UnitId) => {
  if (u === 'segundos') return 'Cada gota es un segundo · arrastra para inclinar el reloj';
  if (u === 'nominas') return 'Cada moneda es una nómina · arrastra para moverlas o apilarlas';
  if (u === 'anios') return 'Cada anillo es un año · toca uno para ver su fecha';
  return matchMedia('(hover: hover) and (pointer: fine)').matches
    ? 'Cada grano es un día · pasa el ratón para ver con lupa · arrastra para inclinar'
    : 'Cada grano es un día · toca para verlo · arrastra o agita para remover';
};

/** Pone los botones y textos de acuerdo con la unidad elegida. */
function updateUnitUi(): void {
  for (const b of unitButtons) {
    const on = b.dataset.unidad === unit;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  if (!play) playBtn.hidden = false;
  ageBtn.setAttribute('aria-disabled', 'false');
  ageBtn.setAttribute('aria-label', 'Probar otra edad de jubilación');
  layersBtn.setAttribute('aria-label', 'Capas por años');
}

function fadeCanvasTransition(): void {
  if (reducedMotion) return;
  canvas.classList.add('cambiando');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => canvas.classList.remove('cambiando'));
  });
}

function setUnit(u: UnitId): void {
  if (u === unit) return;
  unit = u;
  saveUnit(u);
  closeAgePanel();
  hideTooltip();
  hideLens();
  fadeCanvasTransition();
  // Al salir de la reproducción ya se crea el reloj real con la unidad nueva.
  if (play) exitPlay();
  else {
    const cfg = world?.cfg ?? loadConfig();
    if (cfg && !validateConfig(cfg)) createWorld(cfg);
  }
  updateUnitUi();
  if (!userInteracted) showHint(unitHint(u));
  else dismissHint();
}

for (const b of unitButtons) {
  b.addEventListener('click', () => {
    const u = b.dataset.unidad;
    if (isUnitId(u)) setUnit(u);
  });
}
// Con el teclado, las flechas cambian de opción, como en cualquier grupo de botones de radio.
unitBox.addEventListener('keydown', (e) => {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const next = UNIT_IDS[(UNIT_IDS.indexOf(unit) + step + UNIT_IDS.length) % UNIT_IDS.length];
  setUnit(next);
  unitButtons.find((b) => b.dataset.unidad === next)?.focus();
});

showHint(unitHint(unit), 9000);
updateUnitUi();

const initial = loadConfig();
if (initial && !validateConfig(initial) && typeof jornadaFor(initial) !== 'string') {
  isDemoConfig = false;
  customBtn.hidden = true;
  createWorld(initial);
} else {
  isDemoConfig = true;
  customBtn.hidden = false;
  createWorld(DEMO_CONFIG);
}
scheduleMidnight();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__reloj = {
    fps: () => fps,
    shake: (intensity = 1, dir = 1) => applyShake({ intensity, dir }),
    world: () => world,
    tick,
    setLayers,
    startPlay,
    exitPlay,
    play: () => play,
    startSort,
    setUnit,
    tiltTo: (deg: number) => {
      if (!world?.sim) return;
      world.sim.gravityAngle = (deg * Math.PI) / 180;
      world.sim.wakeAll();
    },
    /** Inclina el reloj dibujado como al arrastrar con el ratón (sin soltar); null lo suelta. */
    viewTo: (deg: number | null) => {
      if (world?.altView instanceof ClepsydraView) {
        if (deg === null) world.altView.endTilt();
        else world.altView.setDragAngle((deg * Math.PI) / 180);
        return;
      }
      tilting = deg !== null;
      if (deg !== null) tiltTarget = (deg * Math.PI) / 180;
    },
    celebrate: (i = 0) => world && celebrate(world, world.milestones[i]),
    openShare,
    openAgePanel,
  };
}
