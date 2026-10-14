// Lógica pura de fechas. Todo se trabaja con "números de día civil": días desde el
// 1970-01-01 calculados a partir de año/mes/día con Date.UTC. Así ningún cálculo
// depende de la zona horaria ni de los cambios de horario de verano.
// Cada grano es un día laborable: los fines de semana y festivos no tienen grano.

import { parseExtraHolidays, workdayChecker, workdaysBetween, type HolidayOptions } from './holidays';

export const MS_PER_DAY = 86_400_000;

export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export interface LifeConfig {
  birthDate: string; // AAAA-MM-DD
  retirementAge: number;
  workStartDate: string; // AAAA-MM-DD
  holyThursday?: boolean; // por defecto, sí
  easterMonday?: boolean; // por defecto, no
  extraHolidays?: string; // "24/06, 09/11/2027"
  /** Pagas al año, para la unidad de nóminas: 12 o 14 (por defecto). */
  pagas?: number;
  /** Horario, para la unidad de segundos: "HH:MM". Sin comida si se dejan vacías. */
  jornadaInicio?: string; // por defecto 09:00
  jornadaFin?: string; // por defecto 18:00
  comidaInicio?: string; // por defecto 14:00
  comidaFin?: string; // por defecto 15:00
}

export interface Life {
  birthDay: number;
  startDay: number; // inicio de la vida laboral
  retireDay: number; // día de la jubilación (sin grano)
  lastDay: number; // último día laborable antes de la jubilación (último grano)
  total: number; // número de granos (días laborables)
  /** Día de cada grano, ordenado: workDays[id]. */
  workDays: Int32Array;
  isWorkday: (day: number) => boolean;
}

export const MAX_GRAINS = 40_000;
const MAX_SPAN_DAYS = 60_000;

export function holidayOptions(cfg: LifeConfig): HolidayOptions {
  return {
    holyThursday: cfg.holyThursday ?? true,
    easterMonday: cfg.easterMonday ?? false,
    extra: cfg.extraHolidays ?? '',
  };
}

export function dayFromCivil(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function civilFromDay(dayNum: number): CivilDate {
  const d = new Date(dayNum * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Convierte "AAAA-MM-DD" en número de día, o null si la fecha no existe. */
export function parseIsoDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return dayFromCivil(year, month, day);
}

export function toIsoDate(dayNum: number): string {
  const { year, month, day } = civilFromDay(dayNum);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Día civil local (el que ve el usuario en su calendario) para un instante dado. */
export function localDayNumber(now: Date = new Date()): number {
  return dayFromCivil(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** 0 = domingo … 6 = sábado. El 1970-01-01 fue jueves. */
export function weekday(dayNum: number): number {
  return (((dayNum + 4) % 7) + 7) % 7;
}

/** Suma años conservando mes y día; un 29 de febrero pasa a 28 en años no bisiestos. */
export function addYears(dayNum: number, years: number): number {
  const c = civilFromDay(dayNum);
  const year = c.year + years;
  return dayFromCivil(year, c.month, Math.min(c.day, daysInMonth(year, c.month)));
}

/** Milisegundos hasta la próxima medianoche local (los días de cambio de hora duran 23 o 25 h). */
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Devuelve un mensaje de error en español o null si la configuración es válida. */
export function validateConfig(cfg: LifeConfig): string | null {
  const birth = parseIsoDate(cfg.birthDate);
  const start = parseIsoDate(cfg.workStartDate);
  if (birth === null) return 'La fecha de nacimiento no es válida.';
  if (start === null) return 'La fecha de inicio de la vida laboral no es válida.';
  if (!Number.isInteger(cfg.retirementAge) || cfg.retirementAge < 40 || cfg.retirementAge > 90) {
    return 'La edad de jubilación debe ser un número entero entre 40 y 90.';
  }
  if (start <= birth) return 'Empezar a trabajar antes de nacer es mucho incluso para una consultora.';
  const retire = addYears(birth, cfg.retirementAge);
  if (retire <= start) return 'La jubilación tiene que llegar después del inicio de la vida laboral.';
  if (retire - start > MAX_SPAN_DAYS) return 'Son demasiados años de vida laboral.';
  const extra = parseExtraHolidays(cfg.extraHolidays ?? '');
  if (typeof extra === 'string') return extra;
  const total = workdaysBetween(start, retire, workdayChecker(holidayOptions(cfg))).length;
  if (total === 0) return 'No queda ningún día laborable en ese periodo.';
  if (total > MAX_GRAINS) return `Son demasiados días (máximo ${MAX_GRAINS.toLocaleString('es-ES')}).`;
  return null;
}

export function buildLife(cfg: LifeConfig): Life {
  const error = validateConfig(cfg);
  if (error) throw new Error(error);
  const birthDay = parseIsoDate(cfg.birthDate)!;
  const startDay = parseIsoDate(cfg.workStartDate)!;
  const retireDay = addYears(birthDay, cfg.retirementAge);
  const isWorkday = workdayChecker(holidayOptions(cfg));
  const workDays = workdaysBetween(startDay, retireDay, isWorkday);
  const total = workDays.length;
  return { birthDay, startDay, retireDay, lastDay: workDays[total - 1], total, workDays, isWorkday };
}

/** Primer índice cuyo día es >= day, en una lista de días ordenada. */
export function lowerBound(days: Int32Array, day: number): number {
  let lo = 0;
  let hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (days[mid] < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Granos que ya han caído: los días laborables anteriores a hoy. */
export function fallenCount(life: Life, today: number): number {
  return lowerBound(life.workDays, today);
}

export function remainingDays(life: Life, today: number): number {
  return life.total - fallenCount(life, today);
}

export function grainDay(life: Life, id: number): number {
  return life.workDays[id];
}

/** Id del grano de ese día, o -1 si no es laborable o está fuera de la vida laboral. */
export function grainIdForDay(life: Life, dayNum: number): number {
  const id = lowerBound(life.workDays, dayNum);
  return id < life.total && life.workDays[id] === dayNum ? id : -1;
}

const longFormat = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Jueves 3 de marzo de 2061" */
export function formatDayLong(dayNum: number): string {
  const s = longFormat.format(new Date(dayNum * MS_PER_DAY)).replace(',', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const intFormat = new Intl.NumberFormat('es-ES');
const pctFormat = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatInt(n: number): string {
  return intFormat.format(n);
}

/** 0.0243 → "2,4 %" */
export function formatPercent(fraction: number): string {
  return `${pctFormat.format(fraction * 100)} %`;
}
