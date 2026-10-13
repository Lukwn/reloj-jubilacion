import { formatInt } from './dates';

export interface Milestone {
  /** Grano cuya caída marca el hito: al posarse, ya han caído id + 1 granos. */
  id: number;
  /** Para el aviso: «¡El ecuador de tu vida laboral!». */
  title: string;
  /** Para el grano: «El ecuador de tu vida laboral (50 %)». */
  label: string;
  /** Para «Próximo hito: el ecuador, dentro de…». */
  short: string;
}

const PERCENTS: ReadonlyArray<[number, string, string, string]> = [
  [0.1, '¡Ya llevas el 10 % de tu vida laboral!', 'El 10 % de tu vida laboral', 'el 10 %'],
  [0.25, '¡Un cuarto del camino!', 'Un cuarto de tu vida laboral (25 %)', 'un cuarto del camino'],
  [0.5, '¡El ecuador de tu vida laboral!', 'El ecuador de tu vida laboral (50 %)', 'el ecuador'],
  [0.75, '¡Tres cuartos hechos!', 'Tres cuartos de tu vida laboral (75 %)', 'los tres cuartos'],
  [0.9, '¡El 90 %! Ya se ve la orilla', 'El 90 % de tu vida laboral', 'el 90 %'],
];
const WORKED = [1000, 2500, 5000, 7500, 10_000, 12_500, 15_000, 20_000];
const LEFT = [1000, 500, 100, 10];

/** Hitos de una vida laboral de `total` granos, ordenados por grano. Si dos coinciden, gana el primero. */
export function milestonesFor(total: number): Milestone[] {
  const byId = new Map<number, Milestone>();
  const add = (m: Milestone) => {
    if (m.id >= 0 && m.id < total && !byId.has(m.id)) byId.set(m.id, m);
  };
  add({ id: total - 1, title: '¡Jubilación! Se acabó la arena', label: 'Tu último día de trabajo', short: 'la jubilación' });
  for (const r of LEFT) {
    if (r >= total) continue;
    const n = formatInt(r);
    add({ id: total - r - 1, title: `¡Solo quedan ${n} días laborables!`, label: `Quedan ${n} días laborables`, short: `los últimos ${n} días` });
  }
  for (const [p, title, label, short] of PERCENTS) add({ id: Math.ceil(total * p) - 1, title, label, short });
  for (const w of WORKED) {
    if (w >= total) continue;
    const n = formatInt(w);
    add({ id: w - 1, title: `¡${n} días laborables trabajados!`, label: `${n} días laborables trabajados`, short: `los ${n} días trabajados` });
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Primer hito que aún no se ha alcanzado con `landed` granos caídos, o null. */
export function nextMilestone(list: readonly Milestone[], landed: number): Milestone | null {
  return list.find((m) => m.id >= landed) ?? null;
}
