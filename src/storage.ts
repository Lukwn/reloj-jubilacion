import type { LifeConfig } from './dates';

const CONFIG_KEY = 'reloj-jubilacion.config.v1';
const PROGRESS_KEY = 'reloj-jubilacion.progress.v1';

export interface Progress {
  startDay: number;
  total: number;
  /** Granos que ya se vieron caer en una visita anterior. */
  landed: number;
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
