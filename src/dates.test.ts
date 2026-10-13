import { describe, expect, it } from 'vitest';
import {
  addYears,
  buildLife,
  dayFromCivil,
  fallenCount,
  formatDayLong,
  formatInt,
  formatPercent,
  grainDay,
  grainIdForDay,
  localDayNumber,
  msUntilNextLocalMidnight,
  parseIsoDate,
  remainingDays,
  toIsoDate,
  validateConfig,
  weekday,
} from './dates';

const HOUR = 3_600_000;

describe('zona horaria de los tests', () => {
  it('se ejecuta en Europe/Madrid', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Madrid');
  });
});

describe('números de día civil', () => {
  it('ida y vuelta entre ISO y número de día', () => {
    for (const iso of ['1970-01-01', '2000-02-29', '2025-10-14', '2061-03-03', '2099-12-31']) {
      expect(toIsoDate(parseIsoDate(iso)!)).toBe(iso);
    }
    expect(parseIsoDate('1970-01-01')).toBe(0);
  });

  it('rechaza fechas inexistentes', () => {
    expect(parseIsoDate('2023-02-29')).toBeNull();
    expect(parseIsoDate('2024-13-01')).toBeNull();
    expect(parseIsoDate('2024-04-31')).toBeNull();
    expect(parseIsoDate('no es fecha')).toBeNull();
    expect(parseIsoDate('2024-02-29')).not.toBeNull();
  });

  it('calcula el día de la semana', () => {
    expect(weekday(dayFromCivil(2061, 3, 3))).toBe(4); // jueves
    expect(weekday(dayFromCivil(2025, 10, 14))).toBe(2); // martes
    expect(weekday(dayFromCivil(2026, 10, 13))).toBe(2); // martes
  });
});

describe('años bisiestos', () => {
  it('cuenta 366 días en años bisiestos y 365 en los demás', () => {
    expect(dayFromCivil(2025, 1, 1) - dayFromCivil(2024, 1, 1)).toBe(366);
    expect(dayFromCivil(2024, 1, 1) - dayFromCivil(2023, 1, 1)).toBe(365);
    expect(dayFromCivil(2001, 1, 1) - dayFromCivil(2000, 1, 1)).toBe(366); // divisible entre 400
    expect(dayFromCivil(2101, 1, 1) - dayFromCivil(2100, 1, 1)).toBe(365); // divisible entre 100
  });

  it('un 29 de febrero cumple años el 28 en años no bisiestos', () => {
    expect(toIsoDate(addYears(parseIsoDate('2000-02-29')!, 67))).toBe('2067-02-28');
    expect(toIsoDate(addYears(parseIsoDate('2000-02-29')!, 68))).toBe('2068-02-29');
    expect(toIsoDate(addYears(parseIsoDate('1990-06-15')!, 67))).toBe('2057-06-15');
  });

  it('el mapeo de granos atraviesa el 29 de febrero (miércoles, jueves y viernes)', () => {
    const life = buildLife({ birthDate: '2000-01-01', retirementAge: 67, workStartDate: '2024-02-28' });
    expect(toIsoDate(grainDay(life, 0))).toBe('2024-02-28');
    expect(toIsoDate(grainDay(life, 1))).toBe('2024-02-29');
    expect(toIsoDate(grainDay(life, 2))).toBe('2024-03-01');
  });
});

describe('vida laboral y granos', () => {
  const cfg = { birthDate: '2003-05-10', retirementAge: 67, workStartDate: '2025-09-15' };
  const life = buildLife(cfg);

  it('calcula total, jubilación y último día laborable', () => {
    expect(toIsoDate(life.retireDay)).toBe('2070-05-10'); // sábado
    expect(toIsoDate(life.lastDay)).toBe('2070-05-09'); // viernes
    expect(toIsoDate(grainDay(life, life.total - 1))).toBe('2070-05-09');
    expect(toIsoDate(grainDay(life, 0))).toBe('2025-09-15'); // lunes
    // Unos 5/7 de los días naturales, menos los festivos.
    const span = life.retireDay - life.startDay;
    expect(life.total).toBeLessThan((span * 5) / 7);
    expect(life.total).toBeGreaterThan((span * 5) / 7 - 15 * 45);
  });

  it('los granos son solo días laborables, en orden', () => {
    for (let id = 0; id < life.total; id++) {
      const wd = weekday(grainDay(life, id));
      expect(wd !== 0 && wd !== 6).toBe(true);
      if (id > 0) expect(grainDay(life, id)).toBeGreaterThan(grainDay(life, id - 1));
    }
    expect(grainIdForDay(life, parseIsoDate('2026-12-25')!)).toBe(-1); // Navidad
    expect(grainIdForDay(life, parseIsoDate('2026-10-17')!)).toBe(-1); // sábado
  });

  it('el primer grano es el primer día laborable si se empieza en fin de semana', () => {
    const l = buildLife({ ...cfg, workStartDate: '2025-09-13' }); // sábado
    expect(toIsoDate(grainDay(l, 0))).toBe('2025-09-15');
  });

  it('mapea id ↔ fecha de forma biyectiva', () => {
    for (const id of [0, 1, 365, 9999, life.total - 1]) expect(grainIdForDay(life, grainDay(life, id))).toBe(id);
    expect(grainIdForDay(life, life.startDay - 1)).toBe(-1);
    expect(grainIdForDay(life, life.retireDay)).toBe(-1);
  });

  it('cuenta granos caídos y días restantes', () => {
    // Semana del 12 al 16 de octubre de 2026: el lunes 12 es festivo (día 12 de octubre).
    const mon = parseIsoDate('2026-10-12')!;
    const base = fallenCount(life, mon);
    expect(fallenCount(life, mon + 1)).toBe(base); // el festivo no cae
    expect(fallenCount(life, mon + 2)).toBe(base + 1); // cae el martes
    expect(fallenCount(life, mon + 5)).toBe(base + 4); // sábado: cayó el viernes
    expect(fallenCount(life, mon + 7)).toBe(base + 4); // el fin de semana no cae
    expect(remainingDays(life, mon) + base).toBe(life.total);
    expect(fallenCount(life, life.startDay)).toBe(0); // el primer día aún no ha caído
    expect(fallenCount(life, life.startDay - 100)).toBe(0);
    expect(fallenCount(life, life.retireDay + 100)).toBe(life.total);
    expect(remainingDays(life, life.retireDay)).toBe(0);
  });

  it('valida configuraciones absurdas', () => {
    expect(validateConfig(cfg)).toBeNull();
    expect(validateConfig({ ...cfg, workStartDate: '2000-01-01' })).toMatch(/antes de nacer/);
    expect(validateConfig({ ...cfg, retirementAge: 20 })).not.toBeNull();
    expect(validateConfig({ ...cfg, retirementAge: 67.5 })).not.toBeNull();
    expect(validateConfig({ ...cfg, birthDate: '' })).not.toBeNull();
    expect(validateConfig({ ...cfg, extraHolidays: '31/02' })).toMatch(/no es una fecha/);
    expect(validateConfig({ ...cfg, extraHolidays: 'San Juan' })).toMatch(/DD\/MM/);
    expect(() => buildLife({ ...cfg, birthDate: 'x' })).toThrow();
  });
});

describe('cambios de horario de verano (Europe/Madrid)', () => {
  it('el día local no cambia en las horas raras de un día de 23 h', () => {
    // 29-03-2026: a las 02:00 pasan a ser las 03:00.
    const day = dayFromCivil(2026, 3, 29);
    expect(localDayNumber(new Date(2026, 2, 29, 0, 30))).toBe(day);
    expect(localDayNumber(new Date(2026, 2, 29, 3, 30))).toBe(day);
    expect(localDayNumber(new Date(2026, 2, 29, 23, 59))).toBe(day);
    expect(localDayNumber(new Date(2026, 2, 30, 0, 0))).toBe(day + 1);
  });

  it('el día local no cambia en un día de 25 h', () => {
    // 25-10-2026: a las 03:00 vuelven a ser las 02:00.
    const day = dayFromCivil(2026, 10, 25);
    expect(localDayNumber(new Date(2026, 9, 25, 0, 0))).toBe(day);
    expect(localDayNumber(new Date(2026, 9, 25, 23, 59, 59))).toBe(day);
  });

  it('la medianoche siguiente está a 23 h o 25 h en los días de cambio', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 2, 29, 0, 0))).toBe(23 * HOUR);
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 25, 0, 0))).toBe(25 * HOUR);
    expect(msUntilNextLocalMidnight(new Date(2026, 5, 1, 0, 0))).toBe(24 * HOUR);
    expect(msUntilNextLocalMidnight(new Date(2026, 5, 1, 23, 0))).toBe(HOUR);
  });

  it('los granos caídos no se desfasan al cruzar un cambio de hora', () => {
    // Restar instantes y dividir entre 24 h daría 1,958 días aquí; el cálculo civil da 2.
    // Viernes 27-03 y lunes 30-03 caídos el martes 31, con el cambio de hora en medio.
    const life = buildLife({ birthDate: '2000-01-01', retirementAge: 67, workStartDate: '2026-03-27' });
    expect(fallenCount(life, localDayNumber(new Date(2026, 2, 31, 0, 0)))).toBe(2);
    const life2 = buildLife({ birthDate: '2000-01-01', retirementAge: 67, workStartDate: '2026-10-23' });
    expect(fallenCount(life2, localDayNumber(new Date(2026, 9, 27, 23, 59)))).toBe(2);
  });
});

describe('formato en español', () => {
  it('formatea fechas largas', () => {
    expect(formatDayLong(dayFromCivil(2061, 3, 3))).toBe('Jueves 3 de marzo de 2061');
    expect(formatDayLong(dayFromCivil(2025, 10, 14))).toBe('Martes 14 de octubre de 2025');
  });

  it('formatea el contador', () => {
    expect(formatInt(16042)).toBe('16.042');
    expect(formatPercent(0.0243)).toBe('2,4 %');
    expect(formatPercent(1)).toBe('100,0 %');
  });
});
