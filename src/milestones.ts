import { formatInt } from './dates';
import type { UnitId } from './units';

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

type Texts = [title: string, label: string, short: string];

const PERCENTS: ReadonlyArray<[number, ...Texts]> = [
  [0.1, '¡Ya llevas el 10 % de tu vida laboral!', 'El 10 % de tu vida laboral', 'el 10 %'],
  [0.25, '¡Un cuarto del camino!', 'Un cuarto de tu vida laboral (25 %)', 'un cuarto del camino'],
  [0.5, '¡El ecuador de tu vida laboral!', 'El ecuador de tu vida laboral (50 %)', 'el ecuador'],
  [0.75, '¡Tres cuartos hechos!', 'Tres cuartos de tu vida laboral (75 %)', 'los tres cuartos'],
  [0.9, '¡El 90 %! Ya se ve la orilla', 'El 90 % de tu vida laboral', 'el 90 %'],
];

interface UnitMilestones {
  /** El último grano. */
  last: Texts;
  percents: ReadonlyArray<[number, ...Texts]>;
  /** Granos que quedan: «¡Solo quedan 100 nóminas!». */
  left: readonly number[];
  leftTexts: (n: string, r: number) => Texts;
  /** Granos caídos: «¡250 nóminas cobradas!». */
  done: readonly number[];
  doneTexts: (n: string, d: number) => Texts;
}

const UNITS: Record<UnitId, UnitMilestones> = {
  dias: {
    last: ['¡Jubilación! Se acabó la arena', 'Tu último día antes de jubilarte', 'la jubilación'],
    percents: PERCENTS,
    left: [1000, 500, 100, 10],
    leftTexts: (n) => [`¡Solo quedan ${n} días!`, `Quedan ${n} días`, `los últimos ${n} días`],
    done: [1000, 2500, 5000, 7500, 10_000, 12_500, 15_000, 20_000],
    doneTexts: (n) => [`¡${n} días de vida laboral!`, `${n} días de vida laboral`, `los ${n} días de vida laboral`],
  },
  nominas: {
    last: ['¡La última nómina! Se acabó la arena', 'Tu última nómina', 'la última nómina'],
    percents: PERCENTS,
    left: [100, 50, 14],
    leftTexts: (n, r) =>
      r === 14
        ? ['¡Solo quedan 14 nóminas: un año!', 'Quedan 14 nóminas: un año', 'el último año de nóminas']
        : [`¡Solo quedan ${n} nóminas!`, `Quedan ${n} nóminas`, `las últimas ${n} nóminas`],
    done: [100, 250, 500],
    doneTexts: (n) => [`¡${n} nóminas cobradas!`, `${n} nóminas cobradas`, `las ${n} nóminas cobradas`],
  },
  anios: {
    last: ['¡Tu último año! Se acabó la arena', 'Tu último año de trabajo', 'el último año'],
    percents: PERCENTS,
    left: [10, 5, 1],
    leftTexts: (n, r) =>
      r === 1
        ? ['¡Solo te queda un año!', 'Queda un año', 'el último año']
        : [`¡Solo quedan ${n} años!`, `Quedan ${n} años`, `los últimos ${n} años`],
    done: [10, 20, 30, 40],
    doneTexts: (n) => [`¡${n} años trabajados!`, `${n} años trabajados`, `los ${n} años trabajados`],
  },
  segundos: {
    last: ['¡Fin de la jornada!', 'El último segundo de la jornada', 'el final de la jornada'],
    percents: [[0.5, '¡Ecuador de la jornada!', 'La mitad de la jornada', 'el ecuador de la jornada']],
    left: [3600, 600, 60],
    leftTexts: (_n, r) =>
      r === 3600
        ? ['¡Última hora de la jornada!', 'Empieza la última hora', 'la última hora']
        : r === 600
          ? ['¡Últimos 10 minutos!', 'Quedan 10 minutos', 'los últimos 10 minutos']
          : ['¡Último minuto!', 'Queda un minuto', 'el último minuto'],
    done: [],
    doneTexts: (n) => [n, n, n],
  },
};

/** Hitos de `total` granos de una unidad, ordenados por grano. Si dos coinciden, gana el primero. */
export function milestonesFor(total: number, unit: UnitId = 'dias'): Milestone[] {
  const u = UNITS[unit];
  const byId = new Map<number, Milestone>();
  const add = (id: number, [title, label, short]: Texts) => {
    if (id >= 0 && id < total && !byId.has(id)) byId.set(id, { id, title, label, short });
  };
  add(total - 1, u.last);
  for (const r of u.left) if (r < total) add(total - r - 1, u.leftTexts(formatInt(r), r));
  for (const [p, ...texts] of u.percents) add(Math.ceil(total * p) - 1, texts);
  for (const d of u.done) if (d < total) add(d - 1, u.doneTexts(formatInt(d), d));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Primer hito que aún no se ha alcanzado con `landed` granos caídos, o null. */
export function nextMilestone(list: readonly Milestone[], landed: number): Milestone | null {
  return list.find((m) => m.id >= landed) ?? null;
}
