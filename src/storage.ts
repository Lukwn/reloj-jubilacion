import type { LifeConfig } from './dates';

const CONFIG_KEY = 'reloj-jubilacion.config.v1';
const PROGRESS_KEY = 'reloj-jubilacion.progress.v1';
const LAYERS_KEY = 'reloj-jubilacion.capas.v1';
const SOUND_KEY = 'reloj-jubilacion.sonido.v1';
const MILESTONES_KEY = 'reloj-jubilacion.hitos.v1';

export interface Progress {
  startDay: number;
  total: number;
  /** Granos que ya se vieron caer en una visita anterior. */
  landed: number;
  /**
   * Inicio y festivos con los que se contaron los granos. Si solo cambia la edad de
   * jubilación, los granos caídos siguen siendo los mismos y no hace falta repetir la caída.
   */
  key?: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento (modo privado, cuota llena…): la app sigue funcionando en memoria.
  }
}

export function loadConfig(): LifeConfig | null {
  const c = read<LifeConfig>(CONFIG_KEY);
  if (!c || typeof c.birthDate !== 'string' || typeof c.workStartDate !== 'string') return null;
  if (typeof c.retirementAge !== 'number') return null;
  return c;
}

export function saveConfig(cfg: LifeConfig): void {
  write(CONFIG_KEY, cfg);
}

export function loadProgress(): Progress | null {
  const p = read<Progress>(PROGRESS_KEY);
  if (!p || typeof p.landed !== 'number' || typeof p.startDay !== 'number' || typeof p.total !== 'number') return null;
  return p;
}

export function saveProgress(p: Progress): void {
  write(PROGRESS_KEY, p);
}

/** Si la arena se muestra por capas de años. */
export function loadLayers(): boolean {
  return read<boolean>(LAYERS_KEY) === true;
}

export function saveLayers(on: boolean): void {
  write(LAYERS_KEY, on);
}

export function loadSound(): boolean {
  return read<boolean>(SOUND_KEY) === true;
}

export function saveSound(on: boolean): void {
  write(SOUND_KEY, on);
}

/** Hasta qué grano se han celebrado ya los hitos, para no repetirlos en cada visita. */
export interface MilestonesSeen {
  key: string;
  upTo: number;
}

export function loadMilestonesSeen(): MilestonesSeen | null {
  const m = read<MilestonesSeen>(MILESTONES_KEY);
  return m && typeof m.key === 'string' && typeof m.upTo === 'number' ? m : null;
}

export function saveMilestonesSeen(m: MilestonesSeen): void {
  write(MILESTONES_KEY, m);
}
