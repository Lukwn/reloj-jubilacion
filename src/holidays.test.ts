import { describe, expect, it } from 'vitest';
import { dayFromCivil, toIsoDate } from './dates';
import { easterSunday, holidaysOfYear, parseExtraHolidays, workdayChecker, workdaysBetween } from './holidays';

const base = { holyThursday: true, easterMonday: false, extra: '' };

describe('festivos', () => {
  it('calcula el Domingo de Pascua', () => {
    expect(toIsoDate(easterSunday(2024))).toBe('2024-03-31');
    expect(toIsoDate(easterSunday(2025))).toBe('2025-04-20');
    expect(toIsoDate(easterSunday(2026))).toBe('2026-04-05');
    expect(toIsoDate(easterSunday(2038))).toBe('2038-04-25');
  });

  it('incluye los nacionales y la Semana Santa configurada', () => {
    const iso = (o: typeof base) => [...holidaysOfYear(2026, o)].map(toIsoDate).sort();
    expect(iso(base)).toEqual([
      '2026-01-01', '2026-01-06', '2026-04-02', '2026-04-03', '2026-05-01',
      '2026-08-15', '2026-10-12', '2026-11-01', '2026-12-06', '2026-12-08', '2026-12-25',
    ]);
    expect(iso({ ...base, holyThursday: false, easterMonday: true })).toContain('2026-04-06');
    expect(iso({ ...base, holyThursday: false })).not.toContain('2026-04-02');
  });

  it('interpreta festivos adicionales', () => {
    expect(parseExtraHolidays('24/06, 9/11/2027;15-05')).toEqual({
      recurring: [[6, 24], [5, 15]],
      once: [[2027, 11, 9]],
    });
    expect(parseExtraHolidays('')).toEqual({ recurring: [], once: [] });
    expect(parseExtraHolidays('29/02/2027')).toMatch(/no es una fecha/);
    expect(parseExtraHolidays('29/02')).not.toBeTypeOf('string'); // cuenta solo en bisiestos
    expect(parseExtraHolidays('mañana')).toMatch(/DD\/MM/);
  });

  it('descarta fines de semana, festivos nacionales y adicionales', () => {
    const isWorkday = workdayChecker({ ...base, extra: '24/06, 16/10/2026' });
    // Semana del 12 al 18 de octubre de 2026: lunes 12 festivo nacional, viernes 16 local.
    const mon = dayFromCivil(2026, 10, 12);
    const days = workdaysBetween(mon, mon + 7, isWorkday);
    expect([...days].map(toIsoDate)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
    expect(isWorkday(dayFromCivil(2027, 6, 24))).toBe(false); // jueves, recurrente
    expect(isWorkday(dayFromCivil(2027, 10, 15))).toBe(true); // el 16/10/2026 no se repite
  });
});
