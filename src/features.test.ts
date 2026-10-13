import { describe, expect, it } from 'vitest';
import { countdownText, formatDuration, grainFallsAt } from './countdown';
import { buildLife, dayFromCivil } from './dates';
import { milestonesFor, nextMilestone } from './milestones';

const life = buildLife({ birthDate: '1990-05-10', retirementAge: 67, workStartDate: '2012-09-03' });

describe('cuenta atrás', () => {
  it('formatea duraciones', () => {
    expect(formatDuration(42_000)).toBe('42 s');
    expect(formatDuration(12 * 60_000)).toBe('12 min');
    expect(formatDuration((3 * 60 + 12) * 60_000)).toBe('3 h 12 min');
    expect(formatDuration(5 * 3_600_000)).toBe('5 h');
    expect(formatDuration((2 * 24 + 5) * 3_600_000)).toBe('2 d 5 h');
  });

  it('un día laborable, el grano de hoy cae a medianoche', () => {
    // Martes 13 de octubre de 2026, 20:48 hora local.
    const now = new Date(2026, 9, 13, 20, 48);
    expect(countdownText(life, now)).toBe('Tu grano de hoy cae en 3 h 12 min');
    expect(grainFallsAt(dayFromCivil(2026, 10, 13))).toBe(new Date(2026, 9, 14).getTime());
  });

  it('los viernes se celebra', () => {
    expect(countdownText(life, new Date(2026, 9, 16, 23, 0))).toBe('¡Viernes! Tu grano de hoy cae en 1 h');
  });

  it('el fin de semana espera al lunes por la noche', () => {
    // Sábado 17 a las 12:00 → el grano del lunes 19 cae el martes 20 a las 00:00: 2 d 12 h.
    expect(countdownText(life, new Date(2026, 9, 17, 12, 0))).toBe(
      'Fin de semana: hoy no cae ningún grano · el próximo, en 2 d 12 h',
    );
  });

  it('en un festivo lo dice', () => {
    // Lunes 12 de octubre de 2026, Fiesta Nacional.
    expect(countdownText(life, new Date(2026, 9, 12, 22, 0))).toBe(
      'Hoy es festivo: hoy no cae ningún grano · el próximo, en 1 d 2 h',
    );
  });

  it('después de jubilarse no hay cuenta atrás', () => {
    expect(countdownText(life, new Date(2060, 0, 1))).toBeNull();
  });
});

describe('hitos', () => {
  it('incluye el ecuador, los días trabajados, los que quedan y la jubilación', () => {
    const ms = milestonesFor(11_000);
    const ids = ms.map((m) => m.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ms.find((m) => m.short === 'el ecuador')?.id).toBe(5_499);
    expect(ms.find((m) => m.short === 'los últimos 1000 días')?.id).toBe(9_999);
    expect(ms.at(-1)).toMatchObject({ id: 10_999, short: 'la jubilación' });
  });

  it('si dos hitos caen en el mismo grano, se queda uno', () => {
    // Con 11.000 granos, «quedan 1.000» y «10.000 trabajados» son el mismo grano.
    const same = milestonesFor(11_000).filter((m) => m.id === 9_999);
    expect(same).toHaveLength(1);
    expect(same[0].short).toBe('los últimos 1000 días');
  });

  it('el próximo hito es el primero que no ha caído', () => {
    const ms = milestonesFor(11_000);
    expect(nextMilestone(ms, 0)?.short).toBe('los 1000 días trabajados');
    expect(nextMilestone(ms, 5_499)?.short).toBe('el ecuador');
    expect(nextMilestone(ms, 5_500)?.short).not.toBe('el ecuador');
    expect(nextMilestone(ms, 11_000)).toBeNull();
  });

  it('una vida laboral corta no tiene hitos fuera de rango', () => {
    for (const m of milestonesFor(300)) expect(m.id).toBeLessThan(300);
  });
});
