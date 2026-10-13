import { civilFromDay, fallenCount, localDayNumber, weekday, type Life } from './dates';

/** "42 s", "12 min", "3 h 12 min", "2 d 5 h". */
export function formatDuration(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.ceil(s / 60)} min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h < 24) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh > 0 ? `${d} d ${hh} h` : `${d} d`;
}

/** Momento (ms) en que cae el grano de un día: la medianoche local que lo cierra. */
export function grainFallsAt(day: number): number {
  const c = civilFromDay(day + 1);
  return new Date(c.year, c.month - 1, c.day).getTime();
}

/** Texto de la cuenta atrás hasta que caiga el próximo grano, o null si ya no quedan. */
export function countdownText(life: Life, now: Date): string | null {
  const today = localDayNumber(now);
  const next = fallenCount(life, today);
  if (next >= life.total) return null;
  const day = life.workDays[next];
  const left = formatDuration(grainFallsAt(day) - now.getTime());
  if (day === today) {
    return weekday(today) === 5 ? `¡Viernes! Tu grano de hoy cae en ${left}` : `Tu grano de hoy cae en ${left}`;
  }
  if (today < life.startDay) return `Tu primer grano cae en ${left}`;
  const wd = weekday(today);
  const why = wd === 0 || wd === 6 ? 'Fin de semana' : 'Hoy es festivo';
  return `${why}: hoy no cae ningún grano · el próximo, en ${left}`;
}
