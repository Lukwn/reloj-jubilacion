import { describe, expect, it } from 'vitest';
import { buildLife, dayFromCivil } from './dates';
import { workdayChecker } from './holidays';
import { classifyDay, classifyGrain, grainPhrase, phraseFor, PHRASES, UNIT_PHRASES } from './phrases';
import { buildGrains, workedSecondsAt } from './units';

const ctx = {
  today: dayFromCivil(2026, 10, 13),
  birthDay: dayFromCivil(2003, 5, 10),
  lastDay: dayFromCivil(2070, 5, 9),
};

describe('frases', () => {
  it('hay más de 150 frases de días sin repetir y ningún grupo vacío', () => {
    const all = Object.values(PHRASES).flat();
    expect(all.length).toBeGreaterThan(150);
    for (const list of Object.values(PHRASES)) expect(list.length).toBeGreaterThan(0);
    expect(new Set(all).size).toBe(all.length);
  });

  it('hay más de 150 frases de unidades sin repetir y ningún grupo vacío', () => {
    const all = Object.values(UNIT_PHRASES).flat();
    expect(all.length).toBeGreaterThan(150);
    for (const list of Object.values(UNIT_PHRASES)) expect(list.length).toBeGreaterThan(0);
    expect(new Set(all).size).toBe(all.length);
  });

  it('clasifica los días (incluidos momentos especiales)', () => {
    expect(classifyDay(ctx.lastDay, ctx)).toBe('ultimo');
    expect(classifyDay(dayFromCivil(2025, 10, 14), ctx)).toBe('pasado');
    expect(classifyDay(dayFromCivil(2030, 5, 10), ctx)).toBe('cumple');
    expect(classifyDay(dayFromCivil(2030, 1, 1), ctx)).toBe('anioNuevo');
    expect(classifyDay(dayFromCivil(2030, 12, 22), ctx)).toBe('loteria');
    expect(classifyDay(dayFromCivil(2030, 12, 26), ctx)).toBe('navidad');
    expect(classifyDay(dayFromCivil(2032, 2, 29), ctx)).toBe('bisiesto');
    expect(classifyDay(dayFromCivil(2030, 8, 14), ctx)).toBe('agosto'); // miércoles
    expect(classifyDay(dayFromCivil(2030, 8, 17), ctx)).toBe('finde'); // sábado
    expect(classifyDay(dayFromCivil(2030, 9, 2), ctx)).toBe('septiembre'); // lunes inicio septiembre
    expect(classifyDay(dayFromCivil(2030, 1, 14), ctx)).toBe('cuestaEnero'); // lunes enero
    expect(classifyDay(dayFromCivil(2030, 9, 13), ctx)).toBe('trece'); // viernes 13
    expect(classifyDay(dayFromCivil(2030, 3, 4), ctx)).toBe('lunes');
    expect(classifyDay(dayFromCivil(2030, 3, 8), ctx)).toBe('viernes');
    expect(classifyDay(dayFromCivil(2030, 3, 6), ctx)).toBe('generico');
  });

  it('«año nuevo» es el 1 de enero y los festivos entre semana tienen sus frases', () => {
    const isWorkday = workdayChecker({ holyThursday: true, easterMonday: false, extra: '' });
    const c = { ...ctx, isWorkday };
    expect(classifyDay(dayFromCivil(2030, 1, 1), c)).toBe('anioNuevo');
    expect(classifyDay(dayFromCivil(2030, 1, 2), c)).not.toBe('anioNuevo');
    expect(classifyDay(dayFromCivil(2030, 10, 14), c)).toBe('lunes'); // lunes laborable
    expect(classifyDay(dayFromCivil(2030, 5, 1), c)).toBe('festivo'); // miércoles, Fiesta del Trabajo
    expect(classifyDay(dayFromCivil(2030, 5, 4), c)).toBe('finde'); // sábado
  });

  it('un 29 de febrero celebra el cumpleaños el 28 en años no bisiestos', () => {
    const leap = { ...ctx, birthDay: dayFromCivil(2004, 2, 29) };
    expect(classifyDay(dayFromCivil(2031, 2, 28), leap)).toBe('cumple');
    expect(classifyDay(dayFromCivil(2032, 2, 29), leap)).toBe('cumple');
    expect(classifyDay(dayFromCivil(2032, 2, 28), leap)).not.toBe('cumple');
  });

  it('es determinista y genera gran variedad real en días, nóminas, años y segundos', () => {
    const daySeen = new Set<string>();
    for (let d = ctx.today - 400; d < ctx.today + 4000; d += 37) {
      const p = phraseFor(d, ctx);
      expect(p.length).toBeGreaterThan(10);
      expect(p).toBe(phraseFor(d, { ...ctx }));
      daySeen.add(p);
    }
    expect(daySeen.size).toBeGreaterThan(60);

    // Hitos exactos de días restantes
    expect(phraseFor(ctx.lastDay - 100, ctx)).toContain('100 días');
    expect(phraseFor(ctx.lastDay - 1000, ctx)).toContain('1.000 días');

    const cfg = {
      birthDate: '1995-05-10',
      retirementAge: 67,
      workStartDate: '2020-01-15',
      pagas: 14 as const,
      jornadaInicio: '09:00',
      jornadaFin: '18:00',
      comidaInicio: '14:00',
      comidaFin: '15:00',
    };
    const life = buildLife(cfg);
    const nominas = buildGrains(life, cfg, 'nominas');
    const nomCtx = { today: dayFromCivil(2026, 10, 13), birthDay: life.birthDay, lastDay: life.lastDay, target: 40 };
    const pastNomPhrases = new Set<string>();
    for (let id = 0; id < 40; id++) pastNomPhrases.add(grainPhrase(nominas, id, nomCtx));
    // Con 40 nóminas ya cobradas debe haber mucha variedad (antes eran solo 4 frases).
    expect(pastNomPhrases.size).toBeGreaterThan(22);
    expect(classifyGrain(nominas, 39, 40, nomCtx.today)).toBe('nominaUltimaCobrada');
    expect(grainPhrase(nominas, 9, nomCtx)).toContain('Nómina nº 10');

    // Segundos capicúa y ordenados
    const secs = buildGrains(life, cfg, 'segundos', new Date(2026, 9, 14, 10, 0));
    const j = secs.window!.jornada;
    const secCtx = { today: secs.window!.day, birthDay: life.birthDay, lastDay: life.lastDay, target: 0 };
    const id1111 = workedSecondsAt(j, 11 * 3600 + 11 * 60 + 11);
    const id1234 = workedSecondsAt(j, 12 * 3600 + 34 * 60 + 56);
    expect(grainPhrase(secs, id1111, secCtx)).toContain('11:11:11');
    expect(grainPhrase(secs, id1234, secCtx)).toContain('12:34:56');
  });
});
