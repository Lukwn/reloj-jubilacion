// Días laborables: de lunes a viernes, sin festivos nacionales de España ni los que añada el usuario.
// Todas las fechas son números de día civil (ver dates.ts).

export interface HolidayOptions {
  /** Jueves Santo (festivo en casi todas las comunidades salvo Cataluña y C. Valenciana). */
  holyThursday: boolean;
  /** Lunes de Pascua (Cataluña, C. Valenciana, Navarra, País Vasco, La Rioja…). */
  easterMonday: boolean;
  /** Festivos adicionales: "24/06" se repite cada año, "09/11/2027" es de un solo año. */
  extra: string;
}

export interface ParsedExtra {
  recurring: Array<[month: number, day: number]>;
  once: Array<[year: number, month: number, day: number]>;
}

const dayOf = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Domingo de Pascua (algoritmo anónimo gregoriano). */
export function easterSunday(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayOf(year, month, day);
}

const NATIONAL_FIXED: Array<[number, number]> = [
  [1, 1], // Año Nuevo
  [1, 6], // Reyes
  [5, 1], // Día del Trabajo
  [8, 15], // Asunción
  [10, 12], // Fiesta Nacional
  [11, 1], // Todos los Santos
  [12, 6], // Constitución
  [12, 8], // Inmaculada
  [12, 25], // Navidad
];

/** Devuelve la lista interpretada o un mensaje de error en español. */
export function parseExtraHolidays(s: string): ParsedExtra | string {
  const out: ParsedExtra = { recurring: [], once: [] };
  for (const raw of s.split(/[,;\s]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(token);
    if (!m) return `No entiendo el festivo «${token}». Usa DD/MM o DD/MM/AAAA.`;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = m[3] ? Number(m[3]) : null;
    const max = month >= 1 && month <= 12 ? daysIn(year ?? 2024, month) : 0;
    if (day < 1 || day > max) return `El festivo «${token}» no es una fecha válida.`;
    if (year === null) out.recurring.push([month, day]);
    else out.once.push([year, month, day]);
  }
  return out;
}

export function holidaysOfYear(year: number, opts: HolidayOptions): Set<number> {
  const set = new Set<number>();
  for (const [m, d] of NATIONAL_FIXED) set.add(dayOf(year, m, d));
  const easter = easterSunday(year);
  set.add(easter - 2); // Viernes Santo
  if (opts.holyThursday) set.add(easter - 3);
  if (opts.easterMonday) set.add(easter + 1);
  const extra = parseExtraHolidays(opts.extra);
  if (typeof extra !== 'string') {
    for (const [m, d] of extra.recurring) if (d <= daysIn(year, m)) set.add(dayOf(year, m, d));
    for (const [y, m, d] of extra.once) if (y === year) set.add(dayOf(y, m, d));
  }
  return set;
}

/** Comprobador de días laborables con caché de festivos por año. */
export function workdayChecker(opts: HolidayOptions): (day: number) => boolean {
  const cache = new Map<number, Set<number>>();
  return (day: number) => {
    const wd = (((day + 4) % 7) + 7) % 7; // 0 = domingo
    if (wd === 0 || wd === 6) return false;
    const year = new Date(day * 86_400_000).getUTCFullYear();
    let set = cache.get(year);
    if (!set) {
      set = holidaysOfYear(year, opts);
      cache.set(year, set);
    }
    return !set.has(day);
  };
}

/** Días laborables en [start, end), ordenados. */
export function workdaysBetween(start: number, end: number, isWorkday: (day: number) => boolean): Int32Array {
  const days: number[] = [];
  for (let d = start; d < end; d++) if (isWorkday(d)) days.push(d);
  return Int32Array.from(days);
}
