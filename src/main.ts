import './style.css';
import {
  buildLife,
  fallenCount,
  formatDayLong,
  formatInt,
  formatPercent,
  grainDay,
  localDayNumber,
  msUntilNextLocalMidnight,
  validateConfig,
  type Life,
  type LifeConfig,
} from './dates';
import { phraseFor } from './phrases';
import { designHourglass, type Hourglass } from './hourglass';
import { SandSim } from './sim';
import { Renderer, type HeroDraw, type Point } from './render';
import { MouseShakeDetector, motionImpulse, type ShakeImpulse } from './shake';
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
} from './storage';
import { countdownText } from './countdown';
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
const yearLabel = $('etiqueta-anio');
const layersBtn = $<HTMLButtonElement>('btn-capas');
const sortBtn = $<HTMLButtonElement>('btn-ordenar');
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
  x0: number;
  y0: number;
  y1: number;
  bright: number;
}

interface World {
  cfg: LifeConfig;
  life: Life;
  hg: Hourglass;
  sim: SandSim;
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
  renderer: Renderer;
  today: number;
  /** Granos que deberían haber caído según la fecha de hoy. */
  target: number;
  /** Granos ya posados en el bulbo inferior. */
  landed: number;
  /** Siguiente grano que saldrá por el cuello. */
  nextDrop: number;
  heroes: Hero[];
  nextSpawnAt: number;
  catchUpInterval: number;
}

let world: World | null = null;
let selectedId = -1;
let layersOn = loadLayers();
/** Año bajo el ratón en el modo de capas, o -1. */
let hoverYear = -1;

// ---------------------------------------------------------------- mundo

/** Lo que determina qué día es cada grano caído: el inicio y los festivos (no la edad de jubilación). */
function lifeKey(cfg: LifeConfig): string {
  return JSON.stringify([cfg.workStartDate, cfg.holyThursday ?? true, cfg.easterMonday ?? false, (cfg.extraHolidays ?? '').trim()]);
}

function createWorld(cfg: LifeConfig): void {
  const life = buildLife(cfg);
  const today = localDayNumber();
  const target = fallenCount(life, today);
  const key = lifeKey(cfg);
  const prog = loadProgress();
  const sameLife = prog && prog.startDay === life.startDay && (prog.key ? prog.key === key : prog.total === life.total);
  // Primera visita (o vida laboral nueva): el reloj empieza lleno arriba y los días ya
  // vividos caen delante de ti. Si vuelves tras unos días, caen solo los pendientes.
  const shown = sameLife ? Math.max(0, Math.min(prog.landed, target)) : 0;

  const hg = designHourglass(life.total);
  const sim = new SandSim(hg, life.total);
  sim.pack(shown);
  const sandColors = grainColors(life);
  const layers = yearLayers(life);
  const renderer = new Renderer(canvas, hg, sim, sandColors);
  const milestones = milestonesFor(life.total);
  // La primera vez, los hitos ya pasados no se celebran (caerían todos de golpe).
  const seen = loadMilestonesSeen();

  world = {
    cfg,
    life,
    hg,
    sim,
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
    nextSpawnAt: performance.now() + 800,
    catchUpInterval: 0,
  };
  applyPalette(world);
  endSort();
  selectedId = -1;
  hideTooltip();
  persistProgress(world);
  updateCounter();
  updateCountdown();
}

function persistProgress(w: World): void {
  saveProgress({ startDay: w.life.startDay, total: w.life.total, landed: w.landed, key: w.key });
  saveMilestonesSeen({ key: w.key, upTo: w.seenUpTo });
}

function checkDay(): void {
  const w = world;
  if (!w) return;
  w.today = localDayNumber();
  w.target = fallenCount(w.life, w.today);
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
  return { x: (idx % w.hg.W) + 0.5, y: Math.floor(idx / w.hg.W) + 0.5 };
}

/** Saca por el cuello el siguiente grano. El cuello nunca deja pasar otro. */
function spawnHero(w: World, now: number, glowMs: number, fallMs: number, bright: number): Hero | null {
  const { sim } = w;
  const id = w.nextDrop;
  if (sim.pos[id] < 0) return null;
  // El grano más cercano al cuello adopta la identidad del día que toca.
  const neck = sim.findNeckGrain();
  if (neck >= 0 && neck !== sim.pos[id]) sim.swapCells(neck, sim.pos[id]);
  const from = cellPoint(w, sim.pos[id]);
  sim.take(id);
  w.nextDrop++;
  const landing = sim.findLandingCell();
  const to = landing >= 0 ? cellPoint(w, landing) : { x: w.hg.W / 2, y: w.hg.H - 1 };
  const hero: Hero = { id, t0: now, glowMs, fallMs, x0: from.x, y0: from.y, y1: to.y, bright };
  w.heroes.push(hero);
  return hero;
}

function landHero(w: World, h: Hero): void {
  const idx = w.sim.findLandingCell();
  if (idx >= 0) w.sim.put(h.id, idx);
  w.landed++;
  const m = w.milestoneById.get(h.id);
  if (m && h.id >= w.seenUpTo) w.pendingMilestone = m;
  if (w.landed > w.seenUpTo) w.seenUpTo = w.landed;
  if (h.bright >= 1) sound.tink();
  // Durante una recuperación larga no hace falta guardar en cada grano.
  if (w.heroes.length === 0 || w.landed % 50 === 0) persistProgress(w);
  updateCounter();
}

function heroPoint(w: World, h: Hero, now: number): Point {
  const p = Math.max(0, Math.min(1, (now - h.t0 - h.glowMs) / h.fallMs));
  const cx = w.hg.W / 2;
  return { x: h.x0 + (cx - h.x0) * Math.min(1, p * 4), y: h.y0 + (h.y1 - h.y0) * p * p };
}

function updateDrops(w: World, now: number): void {
  for (let i = w.heroes.length - 1; i >= 0; i--) {
    const h = w.heroes[i];
    if (now - h.t0 >= h.glowMs + h.fallMs) {
      w.heroes.splice(i, 1);
      landHero(w, h);
    }
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
  const id = w.target;
  if (id >= w.life.total || w.nextDrop !== w.target || w.sim.agitation > 0) return;
  const at = w.sim.pos[id];
  if (at < 0) return;
  const neck = w.sim.findNeckGrain();
  if (neck >= 0 && neck !== at) w.sim.swapCells(neck, at);
}

// ---------------------------------------------------------------- agitación

let lastWakeAll = 0;
function applyShake(imp: ShakeImpulse): void {
  const w = world;
  if (!w || reducedMotion) return;
  w.sim.agitation = Math.max(w.sim.agitation, imp.intensity);
  w.sim.tilt = imp.dir * 0.75 * imp.intensity;
  const now = performance.now();
  if (now - lastWakeAll > 200) {
    w.sim.wakeAll();
    lastWakeAll = now;
  }
}

const mouseShake = new MouseShakeDetector();

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
  // La arena de la rejilla no resbala hasta los 45°: se exagera un poco la inclinación
  // para que se note sin tener que tumbar el móvil.
  const target = phone + 0.5 * Math.sin(phone);
  gyroAngle += angleDelta(gyroAngle, target) * 0.3;
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
  const { renderer, sim } = w;
  const g = renderer.toGrid(cssX, cssY);
  const now = performance.now();
  const reach = Math.max(1.5, ((touch ? 16 : 7) * renderer.dpr) / renderer.s);
  for (const h of w.heroes) {
    const p = heroPoint(w, h, now);
    if (Math.hypot(p.x - g.x, p.y - g.y) <= reach * 1.5) return h.id;
  }
  for (const m of w.milestones) {
    if (m.id < w.landed || sim.pos[m.id] < 0) continue;
    const p = cellPoint(w, sim.pos[m.id]);
    if (Math.hypot(p.x - g.x, p.y - g.y) <= reach * 2) return m.id;
  }
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
  const day = grainDay(w.life, id);
  const date = formatDayLong(day);
  tooltipDate.textContent = day === w.today ? `Hoy · ${date}` : date;
  tooltipPhrase.textContent = phraseFor(day, {
    today: w.today,
    birthDay: w.life.birthDay,
    lastDay: w.life.lastDay,
    isWorkday: w.life.isWorkday,
  });
  if (layersOn) tooltipYear.textContent = yearSummary(w, w.layers.yearOf[id]);
  tooltipYear.hidden = !layersOn;
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
  if (layersOn) w.renderer.setColors(w.colors, w.layers.dim, w.layers.yearOf);
  else w.renderer.setColors(w.colors, w.sandDim);
}

const plural = (n: number, one: string, many: string) => `${formatInt(n)} ${n === 1 ? one : many}`;

/** «2031 · 251 días laborables por delante», o los trabajados, o los que quedan del año en curso. */
function yearSummary(w: World, year: number): string {
  const total = w.layers.counts.get(year) ?? 0;
  const first = w.layers.first.get(year) ?? 0;
  const ahead = Math.max(0, Math.min(total, first + total - Math.max(first, w.landed)));
  if (ahead === 0) return `${year} · ${plural(total, 'día laborable trabajado', 'días laborables trabajados')}`;
  if (ahead === total) return `${year} · ${plural(total, 'día laborable por delante', 'días laborables por delante')}`;
  return `${year} · quedan ${formatInt(ahead)} de ${plural(total, 'día laborable', 'días laborables')}`;
}

function showYearLabel(w: World, year: number, cssX: number, cssY: number): void {
  yearLabel.textContent = yearSummary(w, year);
  yearLabel.hidden = false;
  const rect = yearLabel.getBoundingClientRect();
  let left = cssX + 16;
  if (left + rect.width > window.innerWidth - 8) left = cssX - rect.width - 16;
  yearLabel.style.left = `${Math.max(8, left)}px`;
  yearLabel.style.top = `${Math.max(8, cssY - rect.height - 10)}px`;
}

function hideYearLabel(): void {
  yearLabel.hidden = true;
  hoverYear = -1;
}

let hintTimer = 0;
function showHint(text: string, ms = 7000): void {
  hintEl.textContent = text;
  hintEl.classList.remove('oculta');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => hintEl.classList.add('oculta'), ms);
}

function setLayers(on: boolean): void {
  layersOn = on;
  saveLayers(on);
  layersBtn.setAttribute('aria-pressed', String(on));
  sortBtn.hidden = !on;
  hideTooltip();
  hideYearLabel();
  if (world) applyPalette(world);
  if (on) showHint('Cada color es un año · pasa por encima o toca la arena para ver cuál');
}

layersBtn.setAttribute('aria-pressed', String(layersOn));
layersBtn.addEventListener('click', () => setLayers(!layersOn));
sortBtn.hidden = !layersOn;

/** Reordena los granos por fecha: las capas vuelven a quedar limpias, de abajo arriba. */
function startSort(): void {
  const w = world;
  if (!w || w.sim.sorting) return;
  hideTooltip();
  w.sim.startSort();
  sortBtn.disabled = true;
  sortBtn.textContent = 'Ordenando…';
}

function endSort(): void {
  sortBtn.disabled = false;
  sortBtn.textContent = 'Ordenar capas';
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
}

/** Distancia en px a partir de la cual un toque pasa a ser un arrastre. */
const DRAG_START_PX = 6;
let press: Press | null = null;
let finger: (Point & { r: number }) | null = null;

/** Radio del dedo en celdas: unos 11 px con ratón y 18 px con el dedo. */
function fingerRadius(w: World, touch: boolean): number {
  const { dpr, s } = w.renderer;
  return Math.max(1.5, Math.min(28, ((touch ? 18 : 11) * dpr) / s));
}

/** Remueve la arena a lo largo del trazo, en pasos de medio radio para no dejar huecos. */
function digAlong(w: World, a: Point, b: Point, r: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.min(40, Math.max(1, Math.ceil(Math.hypot(dx, dy) / (r * 0.5))));
  for (let i = 1; i <= steps; i++) dugSinceFrame += w.sim.dig(a.x + (dx * i) / steps, a.y + (dy * i) / steps, r, dx, dy);
}

canvas.addEventListener('pointerdown', (e) => {
  askMotionPermission();
  hintEl.classList.add('oculta');
  const w = world;
  if (!w || (e.pointerType === 'mouse' && e.button !== 0)) return;
  press = {
    pointerId: e.pointerId,
    x0: e.clientX,
    y0: e.clientY,
    last: w.renderer.toGrid(e.clientX, e.clientY),
    dragging: false,
    touch: e.pointerType !== 'mouse',
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
  if (press && e.pointerId === press.pointerId) {
    if (!press.dragging) {
      if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_START_PX) return;
      press.dragging = true;
      hideTooltip();
      hideYearLabel();
      canvas.classList.add('removiendo');
    }
    const p = w.renderer.toGrid(e.clientX, e.clientY);
    const r = fingerRadius(w, press.touch);
    digAlong(w, press.last, p, r);
    press.last = p;
    finger = { ...p, r };
    return;
  }
  if (e.pointerType !== 'mouse') return;
  const b = w.renderer.bounds();
  const inside = e.clientX >= b.left - 40 && e.clientX <= b.right + 40 && e.clientY >= b.top && e.clientY <= b.bottom;
  if (inside) {
    const imp = mouseShake.onMove(e.clientX, e.clientY, e.timeStamp);
    if (imp) applyShake(imp);
  }
  if (!layersOn) return;
  const id = inside ? pickGrain(w, e.clientX, e.clientY, false) : -1;
  if (id < 0) {
    hideYearLabel();
    return;
  }
  hoverYear = w.layers.yearOf[id];
  showYearLabel(w, hoverYear, e.clientX, e.clientY);
});

function endPress(e: PointerEvent, tap: boolean): void {
  if (!press || e.pointerId !== press.pointerId) return;
  const p = press;
  press = null;
  finger = null;
  canvas.classList.remove('removiendo');
  const w = world;
  if (!w || !tap || p.dragging) return;
  // Un toque sin arrastre: muestra el grano que hay debajo.
  const id = pickGrain(w, p.x0, p.y0, p.touch);
  if (id < 0) {
    hideTooltip();
    return;
  }
  selectedId = id;
  showTooltip(w, id, p.x0, p.y0);
}

canvas.addEventListener('pointerup', (e) => endPress(e, true));
canvas.addEventListener('pointercancel', (e) => endPress(e, false));
canvas.addEventListener('pointerleave', () => {
  if (!press) hideYearLabel();
});

// ---------------------------------------------------------------- contador

function updateCounter(): void {
  const w = world;
  if (!w) {
    counterEl.textContent = '';
    return;
  }
  const remaining = w.life.total - w.landed;
  const pct = formatPercent(w.landed / w.life.total);
  if (remaining <= 0) counterEl.textContent = `0 días laborables · ${pct} completado · ¡Jubilación!`;
  else {
    const unit = remaining === 1 ? 'día laborable' : 'días laborables';
    counterEl.textContent = `${formatInt(remaining)} ${unit} · ${pct} completado`;
  }
}

// ---------------------------------------------------------------- ajustes

function openSettings(): void {
  const cfg = world?.cfg ?? loadConfig();
  const f = form.elements as unknown as Record<string, HTMLInputElement>;
  f.birthDate.value = cfg?.birthDate ?? '';
  f.retirementAge.value = String(cfg?.retirementAge ?? 67);
  f.workStartDate.value = cfg?.workStartDate ?? '';
  f.holyThursday.checked = cfg?.holyThursday ?? true;
  f.easterMonday.checked = cfg?.easterMonday ?? false;
  f.extraHolidays.value = cfg?.extraHolidays ?? '';
  formError.textContent = '';
  cancelBtn.hidden = !world;
  dialog.showModal();
}

$('btn-ajustes').addEventListener('click', openSettings);

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
    holyThursday: f.holyThursday.checked,
    easterMonday: f.easterMonday.checked,
    extraHolidays: f.extraHolidays.value.trim(),
  };
  const error = validateConfig(cfg);
  if (error) {
    formError.textContent = error;
    return;
  }
  saveConfig(cfg);
  createWorld(cfg);
  dialog.close();
});

// ---------------------------------------------------------------- hitos

function celebrate(w: World, m: Milestone): void {
  milestoneTitle.textContent = m.title;
  milestoneDate.textContent = formatDayLong(grainDay(w.life, m.id));
  // Volver a mostrarlo reinicia la animación de entrada.
  milestoneEl.hidden = true;
  void milestoneEl.offsetWidth;
  milestoneEl.hidden = false;
  clearTimeout(milestoneTimer);
  milestoneTimer = window.setTimeout(() => (milestoneEl.hidden = true), 7000);
  sound.chime();
}
let milestoneTimer = 0;

/** Posición de los tres próximos hitos, para que brillen (todos a la vez serían demasiados). */
function milestoneMarks(w: World): Point[] {
  const out: Point[] = [];
  for (const m of w.milestones) {
    if (m.id < w.landed) continue;
    if (out.length === 3) break;
    const p = w.sim.pos[m.id];
    if (p >= 0) out.push(cellPoint(w, p));
  }
  return out;
}

// ---------------------------------------------------------------- cuenta atrás

function updateCountdown(): void {
  const w = world;
  let line = '';
  if (w) {
    line = countdownText(w.life, new Date()) ?? '';
    // Cada 8 s se alterna con el próximo hito.
    const next = nextMilestone(w.milestones, w.landed);
    if (next && Math.floor(Date.now() / 8000) % 2 === 1) {
      const n = next.id + 1 - w.landed;
      line =
        n === 1
          ? `Próximo hito: ${next.short}, con el próximo grano`
          : `Próximo hito: ${next.short}, dentro de ${formatInt(n)} días laborables`;
    }
  }
  if (countdownEl.textContent !== line) countdownEl.textContent = line;
}

// ---------------------------------------------------------------- sonido

const sound = new SandSound();
let soundOn = loadSound();
sound.enabled = soundOn;
soundBtn.setAttribute('aria-pressed', String(soundOn));
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  saveSound(soundOn);
  soundBtn.setAttribute('aria-pressed', String(soundOn));
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

function openAgePanel(): void {
  const w = world;
  if (!w) return;
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
    return;
  }
  const life = buildLife(cfg);
  if (fallenCount(life, w.today) >= life.total) {
    ageText.textContent = `A los ${age} ya te habrías jubilado: toda la arena de arriba sobraría.`;
    ageUse.disabled = true;
    ageCutoff = w.landed;
    return;
  }
  const ahead = life.total - w.landed;
  const diff = life.total - w.life.total;
  const when = `Te jubilarías el ${lowerFirst(formatDayLong(life.retireDay))}.`;
  ageUse.disabled = age === w.cfg.retirementAge;
  ageCutoff = diff < 0 ? life.total : -1;
  const days = `${formatInt(ahead)} días laborables por delante`;
  if (diff === 0) ageText.textContent = `${days}. Es tu edad actual. ${when}`;
  else if (diff < 0) {
    ageText.textContent = `${days}: ${formatInt(-diff)} menos. Los granos transparentes son los que te ahorrarías. ${when}`;
  } else ageText.textContent = `${days}: ${formatInt(diff)} más. ${when}`;
}

ageBtn.addEventListener('click', () => (agePanel.hidden ? openAgePanel() : closeAgePanel()));
ageClose.addEventListener('click', closeAgePanel);
ageInput.addEventListener('input', updateAgePreview);
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
  if (!w) return;
  hideTooltip();
  closeAgePanel();
  const info = {
    remaining: formatInt(w.life.total - w.landed),
    percent: formatPercent(w.landed / w.life.total),
    fraction: w.landed / w.life.total,
  };
  const frame = { time: performance.now(), heroes: [], today: null, selected: null, highlight: -1, cutoff: -1, marks: [], finger: null };
  const { canvas: clock } = w.renderer.snapshot(CLOCK_SIZE.width, CLOCK_SIZE.height, frame);
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

shareBtn.addEventListener('click', openShare);
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
shareClose.addEventListener('click', () => shareDialog.close());

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

function tick(now: number): void {
  fpsFrames++;
  if (now - fpsSince >= 1000) {
    fps = (fpsFrames * 1000) / (now - fpsSince);
    fpsFrames = 0;
    fpsSince = now;
    if (showFps && world) fpsEl.textContent = `${fps.toFixed(0)} fps · ${world.sim.activeCount} activos`;
  }

  const w = world;
  if (!w) return;
  updateDrops(w, now);
  keepTodayAtNeck(w);

  const sim = w.sim;
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
    const p = heroPoint(w, h, now);
    const glow = h.glowMs > 0 ? Math.min(1, (now - h.t0) / h.glowMs) : 1;
    return { ...p, color: unpackColor(w.colors[h.id]), glow: glow * h.bright };
  });

  let today: Point | null = null;
  if (w.target < w.life.total && w.nextDrop === w.target && w.sim.pos[w.target] >= 0) {
    today = cellPoint(w, w.sim.pos[w.target]);
  }

  let selected: Point | null = null;
  if (selectedId >= 0) {
    const hero = w.heroes.find((h) => h.id === selectedId);
    if (hero) selected = heroPoint(w, hero, now);
    else if (sim.pos[selectedId] >= 0) selected = cellPoint(w, sim.pos[selectedId]);
  }

  let highlight = -1;
  if (layersOn) {
    if (hoverYear >= 0) highlight = hoverYear;
    else if (selectedId >= 0) highlight = w.layers.yearOf[selectedId];
  }

  w.renderer.draw({
    time: now,
    heroes,
    today: reducedMotion ? null : today,
    selected,
    highlight,
    finger,
    cutoff: ageCutoff,
    marks: milestoneMarks(w),
  });
}

// ---------------------------------------------------------------- arranque

window.addEventListener('resize', () => {
  world?.renderer.resize();
  hideTooltip();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => world?.renderer.refreshTheme());
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
window.setTimeout(() => hintEl.classList.add('oculta'), 10_000);

const initial = loadConfig();
if (initial && !validateConfig(initial)) createWorld(initial);
else openSettings();
scheduleMidnight();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__reloj = {
    fps: () => fps,
    shake: (intensity = 1, dir = 1) => applyShake({ intensity, dir }),
    world: () => world,
    tick,
    setLayers,
    startSort,
    tiltTo: (deg: number) => {
      if (!world) return;
      world.sim.gravityAngle = (deg * Math.PI) / 180;
      world.sim.wakeAll();
    },
    celebrate: (i = 0) => world && celebrate(world, world.milestones[i]),
    openShare,
    openAgePanel,
  };
}
