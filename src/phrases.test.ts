import { describe, expect, it } from 'vitest';
import { dayFromCivil } from './dates';
import { workdayChecker } from './holidays';
import { classifyDay, phraseFor, PHRASES } from './phrases';

const ctx = {
  today: dayFromCivil(2026, 10, 13),
  birthDay: dayFromCivil(2003, 5, 10),
  lastDay: dayFromCivil(2070, 5, 9),
};

describe('frases', () => {
  it('hay más de 60 frases, sin repetir y ningún grupo vacío', () => {
    const all = Object.values(PHRASES).flat();
    expect(all.length).toBeGreaterThan(60);
    for (const list of Object.values(PHRASES)) expect(list.length).toBeGreaterThan(0);
    expect(new Set(all).size).toBe(all.length);
  });

  it('clasifica los días', () => {
    expect(classifyDay(ctx.lastDay, ctx)).toBe('ultimo');
    expect(classifyDay(dayFromCivil(2025, 10, 14), ctx)).toBe('pasado');
    expect(classifyDay(dayFromCivil(2030, 5, 10), ctx)).toBe('cumple');
    expect(classifyDay(dayFromCivil(2030, 1, 1), ctx)).toBe('anioNuevo');
    expect(classifyDay(dayFromCivil(2030, 12, 26), ctx)).toBe('navidad');
    expect(classifyDay(dayFromCivil(2030, 8, 14), ctx)).toBe('agosto'); // miércoles
    expect(classifyDay(dayFromCivil(2030, 8, 17), ctx)).toBe('finde'); // sábado
    expect(classifyDay(dayFromCivil(2030, 3, 4), ctx)).toBe('lunes');
    expect(classifyDay(dayFromCivil(2030, 3, 8), ctx)).toBe('viernes');
    expect(classifyDay(dayFromCivil(2030, 3, 6), ctx)).toBe('generico');
  });

  it('con días laborables, «año nuevo» es el primer día laborable del año', () => {
    const isWorkday = workdayChecker({ holyThursday: true, easterMonday: false, extra: '' });
    const c = { ...ctx, isWorkday };
    expect(classifyDay(dayFromCivil(2030, 1, 2), c)).toBe('anioNuevo'); // miércoles
    expect(classifyDay(dayFromCivil(2030, 1, 3), c)).not.toBe('anioNuevo');
    expect(classifyDay(dayFromCivil(2031, 1, 2), c)).toBe('anioNuevo'); // jueves
  });

  it('un 29 de febrero celebra el cumpleaños el 28 en años no bisiestos', () => {
    const leap = { ...ctx, birthDay: dayFromCivil(2004, 2, 29) };
    expect(classifyDay(dayFromCivil(2031, 2, 28), leap)).toBe('cumple');
    expect(classifyDay(dayFromCivil(2032, 2, 29), leap)).toBe('cumple');
    expect(classifyDay(dayFromCivil(2032, 2, 28), leap)).not.toBe('cumple');
  });

  it('es determinista: el mismo grano dice siempre lo mismo', () => {
    for (let d = ctx.today - 400; d < ctx.today + 4000; d += 37) {
      expect(phraseFor(d, ctx)).toBe(phraseFor(d, { ...ctx }));
      expect(PHRASES[classifyDay(d, ctx)]).toContain(phraseFor(d, ctx));
    }
  });
});
