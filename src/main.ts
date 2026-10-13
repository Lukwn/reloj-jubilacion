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
import { grainColors, unpackColor } from './colors';
import { loadConfig, loadProgress, saveConfig, saveProgress } from './storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('reloj');
const counterEl = $('contador');
const hintEl = $('pista');
const tooltipEl = $('tooltip');
const tooltipDate = $('tooltip-fecha');
const tooltipPhrase = $('tooltip-frase');
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
  colors: Uint32Array;
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

// ---------------------------------------------------------------- mundo

function createWorld(cfg: LifeConfig): void {
  const life = buildLife(cfg);
  const today = localDayNumber();
  const target = fallenCount(life, today);
  const prog = loadProgress();
  const sameLife = prog && prog.startDay === life.startDay && prog.total === life.total;
  // Primera visita (o vida laboral nueva): el reloj empieza lleno arriba y los días ya
  // vividos caen delante de ti. Si vuelves tras unos días, caen solo los pendientes.
  const shown = sameLife ? Math.max(0, Math.min(prog.landed, target)) : 0;

  const hg = designHourglass(life.total);
  const sim = new SandSim(hg, life.total);
  sim.pack(shown);
  const colors = grainColors(life);
  const renderer = new Renderer(canvas, hg, sim, colors);

  world = {
    cfg,
    life,
    hg,
    sim,
    colors,
    renderer,
    today,
    target,
    landed: shown,
    nextDrop: shown,
    heroes: [],
    nextSpawnAt: performance.now() + 800,
    catchUpInterval: 0,
  };
  selectedId = -1;
  hideTooltip();
  persistProgress(world);
  updateCounter();
}

function persistProgress(w: World): void {
  saveProgress({ startDay: w.life.startDay, total: w.life.total, landed: w.landed });
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
canvas.addEventListener('pointermove', (e) => {
  if (!world || e.pointerType !== 'mouse') return;
  const b = world.renderer.bounds();
  if (e.clientX < b.left - 40 || e.clientX > b.right + 40 || e.clientY < b.top || e.clientY > b.bottom) return;
  const imp = mouseShake.onMove(e.clientX, e.clientY, e.timeStamp);
  if (imp) applyShake(imp);
});

const motionPrev = { x: 0, y: 0, z: 0 };
window.addEventListener('devicemotion', (e) => {
  const imp = motionImpulse(e, motionPrev);
  if (imp) applyShake(imp);
});

let motionPermissionAsked = false;
function askMotionPermission(): void {
  if (motionPermissionAsked) return;
  motionPermissionAsked = true;
  const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } })
    .DeviceMotionEvent;
  if (DME && typeof DME.requestPermission === 'function') DME.requestPermission().catch(() => undefined);
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

canvas.addEventListener('pointerdown', (e) => {
  askMotionPermission();
  hintEl.classList.add('oculta');
  const w = world;
  if (!w) return;
  const id = pickGrain(w, e.clientX, e.clientY, e.pointerType !== 'mouse');
  if (id < 0) {
    hideTooltip();
    return;
  }
  selectedId = id;
  showTooltip(w, id, e.clientX, e.clientY);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideTooltip();
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

  w.renderer.draw({ time: now, heroes, today: reducedMotion ? null : today, selected });
}

// ---------------------------------------------------------------- arranque

window.addEventListener('resize', () => {
  world?.renderer.resize();
  hideTooltip();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => world?.renderer.refreshTheme());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkDay();
    scheduleMidnight();
  }
});
window.setInterval(checkDay, 60_000);
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
  };
}
