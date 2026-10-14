// Unidades de tiempo del reloj. Cada grano es un periodo que cae cuando termina:
// - días laborables: a medianoche;
// - nóminas: al terminar el día de cobro (el último día laborable del mes);
// - años: en Nochevieja;
// - segundos: el reloj muestra solo la jornada de hoy y cae un grano por segundo trabajado.
// Salvo en segundos, cada grano tiene un día civil y los granos están ordenados por él, así que
// «cuántos han caído» es una búsqueda binaria, como con los días.

import {
  civilFromDay,
  dayFromCivil,
  daysInMonth,
  formatDayLong,
  formatInt,
  localDayNumber,
  lowerBound,
  type Life,
  type LifeConfig,
} from './dates';
import { countdownText, formatDuration } from './countdown';

export type UnitId = 'dias' | 'segundos' | 'nominas' | 'anios';
export const UNIT_IDS: readonly UnitId[] = ['dias', 'segundos', 'nominas', 'anios'];

export function isUnitId(v: unknown): v is UnitId {
  return typeof v === 'string' && (UNIT_IDS as readonly string[]).includes(v);
}

export interface UnitNames {
  one: string;
  many: string;
  /** Texto del selector. */
  label: string;
  /** «Cada grano es …». */
  grain: string;
  /** «…, ya trabajados». */
  done: string;
}

export const UNIT_NAMES: Record<UnitId, UnitNames> = {
  dias: { one: 'día laborable', many: 'días laborables', label: 'Días', grain: 'un día laborable', done: 'trabajados' },
  segundos: {
    one: 'segundo de trabajo',
    many: 'segundos de trabajo',
    label: 'Segundos',
    grain: 'un segundo de tu jornada de hoy',
    done: 'trabajados',
  },
  nominas: { one: 'nómina', many: 'nóminas', label: 'Nóminas', grain: 'una nómina', done: 'cobradas' },
  anios: { one: 'año', many: 'años', label: 'Años', grain: 'un año', done: 'trabajados' },
};

export function plural(n: number, unit: UnitId): string {
  const { one, many } = UNIT_NAMES[unit];
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------- jornada

/** Horario de trabajo en minutos desde medianoche. Sin pausa si breakStart === breakEnd. */
export interface Jornada {
  start: number;
  end: number;
  breakStart: number;
  breakEnd: number;
}

/** "9:05" o "09:05" → 545. */
export function parseClock(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Horario de la configuración (con sus valores por defecto), o un mensaje de error en español. */
export function jornadaFor(cfg: LifeConfig): Jornada | string {
  const start = parseClock(cfg.jornadaInicio || '09:00');
  const end = parseClock(cfg.jornadaFin || '18:00');
  if (start === null || end === null) return 'El horario no es válido: usa horas como 09:00.';
  if (end <= start) return 'La jornada tiene que terminar después de empezar.';
  // Sin comida si las dos horas están vacías a propósito; si no se han tocado, de 14:00 a 15:00.
  const noBreak = cfg.comidaInicio === '' && cfg.comidaFin === '';
  if (noBreak) return { start, end, breakStart: start, breakEnd: start };
  const bs = parseClock(cfg.comidaInicio || '14:00');
  const be = parseClock(cfg.comidaFin || '15:00');
  if (bs === null || be === null) return 'La hora de la comida no es válida: usa horas como 14:00.';
  if (be <= bs) return 'La comida tiene que terminar después de empezar.';
  if (bs < start || be > end) return 'La comida tiene que caer dentro de la jornada.';
  return { start, end, breakStart: bs, breakEnd: be };
}

const breakSecs = (j: Jornada) => (j.breakEnd - j.breakStart) * 60;

/** Segundos trabajados en una jornada completa. */
export function jornadaSeconds(j: Jornada): number {
  return (j.end - j.start) * 60 - breakSecs(j);
}

/** Segundo del día (desde medianoche) en que empieza el segundo trabajado número `i`. */
export function workedSecondOfDay(j: Jornada, i: number): number {
  const before = (j.breakStart - j.start) * 60;
  return j.start * 60 + i + (breakSecs(j) > 0 && i >= before ? breakSecs(j) : 0);
}

/** Segundos trabajados hasta el segundo del día `sec` (sin contar la comida). */
export function workedSecondsAt(j: Jornada, sec: number): number {
  const span = Math.min(Math.max(sec - j.start * 60, 0), (j.end - j.start) * 60);
  const inBreak = Math.min(Math.max(Math.min(sec, j.breakEnd * 60) - j.breakStart * 60, 0), breakSecs(j));
  return span - inBreak;
}

const secondOfDay = (d: Date) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();

/** Instante local de un segundo del día de un día civil (sin líos con el horario de verano). */
function localTime(day: number, sec: number): number {
  const c = civilFromDay(day);
  return new Date(c.year, c.month - 1, c.day, 0, 0, sec).getTime();
}

/** Día de la jornada que muestra la unidad de segundos: hoy si se trabaja; si no, la próxima. */
export function windowDayFor(life: Life, now: Date): number {
  const i = lowerBound(life.workDays, localDayNumber(now));
  return i < life.total ? life.workDays[i] : life.lastDay;
}

/** Segundos de trabajo que quedan hasta la jubilación, y los de toda la vida laboral. */
export function careerSeconds(life: Life, j: Jornada, now: Date): { left: number; total: number } {
  const per = jornadaSeconds(j);
  const today = localDayNumber(now);
  const i = lowerBound(life.workDays, today);
  let left = (life.total - i) * per;
  if (i < life.total && life.workDays[i] === today) left -= workedSecondsAt(j, secondOfDay(now));
  return { left, total: life.total * per };
}

// ---------------------------------------------------------------- granos

export interface GrainSet {
  unit: UnitId;
  total: number;
  /** Día civil de cada grano, sin decrecer: el grano cae al terminar ese día. */
  days: Int32Array;
  /** Nóminas: 1 si el grano es una paga extra. */
  extra: Uint8Array | null;
  /** Segundos: la jornada que se muestra. */
  window: { day: number; jornada: Jornada } | null;
}

export function buildGrains(life: Life, cfg: LifeConfig, unit: UnitId, now: Date = new Date()): GrainSet {
  const base = { unit, extra: null, window: null };
  if (unit === 'dias') return { ...base, total: life.total, days: life.workDays };

  if (unit === 'segundos') {
    const jornada = jornadaFor(cfg);
    if (typeof jornada === 'string') throw new Error(jornada);
    const day = windowDayFor(life, now);
    const total = jornadaSeconds(jornada);
    return { ...base, total, days: new Int32Array(total).fill(day), window: { day, jornada } };
  }

  const days: number[] = [];
  const extra: number[] = [];
  const first = civilFromDay(life.startDay);
  const last = civilFromDay(life.lastDay);

  if (unit === 'anios') {
    // Un grano por año natural. El último cae con la jubilación, no en Nochevieja.
    for (let y = first.year; y <= last.year; y++) days.push(Math.min(dayFromCivil(y, 12, 31), life.lastDay));
    return { ...base, total: days.length, days: Int32Array.from(days) };
  }

  // Nóminas: el último día laborable de cada mes (o el último antes de jubilarse).
  const pagas = cfg.pagas === 12 ? 12 : 14;
  for (let y = first.year, m = first.month; y < last.year || (y === last.year && m <= last.month); ) {
    let d = Math.min(dayFromCivil(y, m, daysInMonth(y, m)), life.lastDay);
    while (d >= life.startDay && !life.isWorkday(d)) d--;
    if (d >= life.startDay && civilFromDay(d).month === m) {
      days.push(d);
      extra.push(0);
      // Las pagas extra de junio y diciembre se cobran con la nómina del mes.
      if (pagas === 14 && (m === 6 || m === 12)) {
        days.push(d);
        extra.push(1);
      }
    }
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return { ...base, total: days.length, days: Int32Array.from(days), extra: Uint8Array.from(extra) };
}

/** Granos que han caído en el instante `now`. */
export function fallenAt(set: GrainSet, now: Date): number {
  const today = localDayNumber(now);
  if (set.window) {
    if (today < set.window.day) return 0;
    if (today > set.window.day) return set.total;
    return Math.min(set.total, workedSecondsAt(set.window.jornada, secondOfDay(now)));
  }
  return lowerBound(set.days, today);
}

/** Granos caídos al empezar el día `day` (para reproducir el paso del tiempo; no en segundos). */
export function fallenAtDay(set: GrainSet, day: number): number {
  return lowerBound(set.days, day);
}

/** Instante (ms) en que cae el grano `id`. */
export function fallsAt(set: GrainSet, id: number): number {
  if (set.window) return localTime(set.window.day, workedSecondOfDay(set.window.jornada, id) + 1);
  return localTime(set.days[id] + 1, 0);
}

// ---------------------------------------------------------------- textos de cada grano

const monthFormat = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });
const monthName = (day: number) => monthFormat.format(new Date(day * 86_400_000));
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "09:05:07" */
export function formatClock(sec: number): string {
  return `${pad2(Math.floor(sec / 3600))}:${pad2(Math.floor((sec % 3600) / 60))}:${pad2(sec % 60)}`;
}

/** Título del grano: «Jueves 3 de marzo de 2061», «Paga extra de junio de 2031», «Año 2040», «11:23:45». */
export function grainTitle(set: GrainSet, id: number): string {
  const day = set.days[id];
  switch (set.unit) {
    case 'dias':
      return formatDayLong(day);
    case 'nominas':
      return `${set.extra?.[id] ? 'Paga extra' : 'Nómina'} de ${monthName(day)} de ${civilFromDay(day).year}`;
    case 'anios':
      return `Año ${civilFromDay(day).year}`;
    case 'segundos':
      return formatClock(workedSecondOfDay(set.window!.jornada, id));
  }
}

/**
 * Cuándo cae (o cayó) el grano, contado desde ahora. `target` es el primer grano que aún no
 * ha caído; `today` el día de hoy (o el reproducido).
 */
export function grainWhen(set: GrainSet, life: Life, id: number, target: number, today: number, now: Date): string {
  const day = set.days[id];
  switch (set.unit) {
    case 'dias': {
      if (day === today) return 'Hoy';
      // target es el primer grano de hoy en adelante: hoy si es laborable, si no el siguiente.
      if (id >= target) {
        const n = id - target + (life.isWorkday(today) ? 0 : 1);
        return n === 1 ? 'El próximo día laborable' : `Dentro de ${formatInt(n)} días laborables`;
      }
      const n = target - id;
      return n === 1 ? 'El último día laborable' : `Hace ${formatInt(n)} días laborables`;
    }
    case 'nominas': {
      const cobro = `se cobra el ${lowerFirst(formatDayLong(day))}`;
      if (id >= target) {
        const n = id - target + 1;
        return `${n === 1 ? 'La próxima' : `Dentro de ${formatInt(n)} nóminas`} · ${cobro}`;
      }
      const n = target - id;
      return `${n === 1 ? 'La última que cobraste' : `Hace ${formatInt(n)} nóminas`} · se cobró el ${lowerFirst(formatDayLong(day))}`;
    }
    case 'anios': {
      const year = civilFromDay(day).year;
      const d = year - civilFromDay(today).year;
      const range =
        id === 0 && day >= life.startDay && civilFromDay(life.startDay).year === year && life.startDay !== dayFromCivil(year, 1, 1)
          ? ` · desde el ${lowerFirst(formatDayLong(life.startDay))}`
          : id === set.total - 1 && day === life.lastDay && day !== dayFromCivil(year, 12, 31)
            ? ` · hasta el ${lowerFirst(formatDayLong(day))}`
            : '';
      const rel = d === 0 ? 'Este año' : d === 1 ? 'El año que viene' : d === -1 ? 'El año pasado' : d > 0 ? `Dentro de ${d} años` : `Hace ${-d} años`;
      return rel + range;
    }
    case 'segundos': {
      const diff = fallsAt(set, id) - 1000 - now.getTime();
      const date = formatDayLong(set.window!.day);
      if (Math.abs(diff) < 1000) return `${date} · ahora mismo`;
      return diff > 0 ? `${date} · dentro de ${formatDuration(diff)}` : `${date} · hace ${formatDuration(-diff)}`;
    }
  }
}

// ---------------------------------------------------------------- cuenta atrás

/** La línea de cuenta atrás bajo el contador, según la unidad. */
export function unitCountdown(set: GrainSet, life: Life, now: Date): string | null {
  if (set.unit === 'dias') return countdownText(life, now);
  const next = fallenAt(set, now);
  if (next >= set.total) return set.unit === 'segundos' ? jornadaDone(set, life, now) : null;
  const left = formatDuration(fallsAt(set, next) - now.getTime());

  if (set.unit === 'nominas') {
    const withExtra = set.extra![next] === 1 || (next + 1 < set.total && set.days[next + 1] === set.days[next] && set.extra![next + 1] === 1);
    return `Tu próxima nómina cae en ${left}${withExtra ? ', con paga extra' : ''}`;
  }
  if (set.unit === 'anios') {
    const day = set.days[next];
    const year = civilFromDay(day).year;
    if (day !== dayFromCivil(year, 12, 31)) return `Tu último año cae con la jubilación, dentro de ${left}`;
    return `${year} cae en Nochevieja, dentro de ${left}`;
  }

  // Segundos
  const w = set.window!;
  const today = localDayNumber(now);
  const j = w.jornada;
  const startAt = localTime(w.day, j.start * 60);
  if (today < w.day) return `Hoy no se trabaja · tu próxima jornada empieza en ${formatDuration(startAt - now.getTime())}`;
  const sec = secondOfDay(now);
  if (sec < j.start * 60) return `Tu jornada empieza en ${formatDuration(startAt - now.getTime())}`;
  if (sec >= j.breakStart * 60 && sec < j.breakEnd * 60) {
    return `Pausa para comer · vuelves en ${formatDuration(localTime(w.day, j.breakEnd * 60) - now.getTime())}`;
  }
  const leftToday = set.total - next;
  return `Quedan ${formatClock(leftToday)} de jornada`;
}

function jornadaDone(set: GrainSet, life: Life, now: Date): string | null {
  if (localDayNumber(now) > set.window!.day) return null;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const nextDay = windowDayFor(life, tomorrow);
  if (nextDay <= set.window!.day) return 'Jornada terminada. Y la última: ¡te jubilas!';
  return nextDay === set.window!.day + 1 ? 'Jornada terminada · mañana más' : `Jornada terminada · la próxima, el ${lowerFirst(formatDayLong(nextDay))}`;
}

// ---------------------------------------------------------------- capas

/** Grupo de cada grano para las capas de colores: el año, o la hora en la unidad de segundos. */
export function groupOfGrain(set: GrainSet, id: number): number {
  if (set.window) return Math.floor(workedSecondOfDay(set.window.jornada, id) / 3600);
  return civilFromDay(set.days[id]).year;
}

/** «Año 2040» o «De 11:00 a 12:00». */
export function groupLabel(set: GrainSet, group: number): string {
  return set.window ? `De ${pad2(group)}:00 a ${pad2(group + 1)}:00` : `Año ${group}`;
}
