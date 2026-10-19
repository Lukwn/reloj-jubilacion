import { describe, expect, it } from 'vitest';
import { buildLife, dayFromCivil, fallenCount, toIsoDate, weekday } from './dates';
import { milestonesFor } from './milestones';
import { classifyGrain, grainPhrase, UNIT_PHRASES } from './phrases';
import {
  buildGrains,
  careerSeconds,
  fallenAt,
  fallenAtDay,
  fallsAt,
  grainTitle,
  grainWhen,
  jornadaFor,
  jornadaSeconds,
  unitCountdown,
  windowDayFor,
  workedSecondOfDay,
  workedSecondsAt,
  type Jornada,
} from './units';

const cfg = { birthDate: '2003-05-10', retirementAge: 67, workStartDate: '2025-09-15' };
const life = buildLife(cfg);
const J = jornadaFor(cfg) as Jornada;
const at = (h: number, m = 0, s = 0) => h * 3600 + m * 60 + s;

describe('jornada', () => {
  it('por defecto, de 9 a 18 con la comida de 14 a 15: 8 horas', () => {
    expect(J).toEqual({ start: 540, end: 1080, breakStart: 840, breakEnd: 900 });
    expect(jornadaSeconds(J)).toBe(8 * 3600);
  });

  it('se salta la hora de comer', () => {
    expect(workedSecondOfDay(J, 0)).toBe(at(9));
    expect(workedSecondOfDay(J, 5 * 3600 - 1)).toBe(at(13, 59, 59));
    expect(workedSecondOfDay(J, 5 * 3600)).toBe(at(15));
    expect(workedSecondsAt(J, at(8))).toBe(0);
    expect(workedSecondsAt(J, at(11))).toBe(2 * 3600);
    expect(workedSecondsAt(J, at(14, 30))).toBe(5 * 3600);
    expect(workedSecondsAt(J, at(16))).toBe(6 * 3600);
    expect(workedSecondsAt(J, at(20))).toBe(8 * 3600);
  });

  it('sin comida si las dos horas están vacías, y valida horarios absurdos', () => {
    const j = jornadaFor({ ...cfg, jornadaInicio: '08:00', jornadaFin: '15:00', comidaInicio: '', comidaFin: '' }) as Jornada;
    expect(jornadaSeconds(j)).toBe(7 * 3600);
    expect(workedSecondOfDay(j, 3600)).toBe(at(9));
    expect(jornadaFor({ ...cfg, jornadaInicio: '18:00', jornadaFin: '09:00' })).toMatch(/terminar después/);
    expect(jornadaFor({ ...cfg, comidaInicio: '19:00', comidaFin: '20:00' })).toMatch(/dentro de la jornada/);
    expect(jornadaFor({ ...cfg, jornadaInicio: '25:00' })).toMatch(/no es válido/);
  });
});

describe('nóminas', () => {
  const n14 = buildGrains(life, cfg, 'nominas');
  const n12 = buildGrains(life, { ...cfg, pagas: 12 }, 'nominas');

  it('el último día laborable de cada mes, con las extras de junio y diciembre', () => {
    expect(toIsoDate(n14.days[0])).toBe('2025-09-30');
    expect(grainTitle(n14, 0)).toBe('Nómina de septiembre de 2025');
    // Diciembre de 2025: la nómina y la extra, el mismo día.
    const dec = [...n14.days].map(toIsoDate).indexOf('2025-12-31');
    expect(grainTitle(n14, dec)).toBe('Nómina de diciembre de 2025');
    expect(grainTitle(n14, dec + 1)).toBe('Paga extra de diciembre de 2025');
    // Octubre de 2026: el 31 es sábado, se cobra el viernes 30.
    expect([...n14.days].map(toIsoDate)).toContain('2026-10-30');
  });

  it('14 pagas al año, o 12 con las extras prorrateadas', () => {
    const in2030 = (set: typeof n14) => [...set.days].filter((d) => d >= dayFromCivil(2030, 1, 1) && d <= dayFromCivil(2030, 12, 31)).length;
    expect(in2030(n14)).toBe(14);
    expect(in2030(n12)).toBe(12);
    for (const d of n14.days) expect(life.isWorkday(d)).toBe(true);
    expect(n14.days[n14.total - 1]).toBeLessThanOrEqual(life.lastDay);
  });

  it('cae al terminar el día de cobro', () => {
    const i = [...n14.days].map(toIsoDate).indexOf('2026-10-30');
    expect(fallenAt(n14, new Date(2026, 9, 30, 23, 59))).toBe(i);
    expect(fallenAt(n14, new Date(2026, 9, 31, 0, 0))).toBe(i + 1);
    expect(fallsAt(n14, i)).toBe(new Date(2026, 9, 31).getTime());
    expect(unitCountdown(n14, life, new Date(2026, 9, 29, 12, 0))).toBe('Tu próxima nómina cae en 1 d 12 h');
    expect(unitCountdown(n14, life, new Date(2026, 11, 30, 12, 0))).toBe('Tu próxima nómina cae en 1 d 12 h, con paga extra');
  });
});

describe('años', () => {
  const years = buildGrains(life, cfg, 'anios');

  it('un grano por año natural; el último cae con la jubilación', () => {
    expect(years.total).toBe(2070 - 2025 + 1);
    expect(grainTitle(years, 0)).toBe('Año 2025');
    expect(toIsoDate(years.days[years.total - 1])).toBe(toIsoDate(life.lastDay));
    expect(fallenAt(years, new Date(2025, 11, 31, 23, 59))).toBe(0);
    expect(fallenAt(years, new Date(2026, 0, 1, 0, 0))).toBe(1);
    expect(fallenAtDay(years, dayFromCivil(2040, 6, 1))).toBe(2040 - 2025);
  });

  it('cuenta atrás y cuándo cae cada año', () => {
    const now = new Date(2026, 9, 14, 12, 0);
    const today = dayFromCivil(2026, 10, 14);
    // 78 d 13 h y no 12 h: el 25 de octubre, al volver al horario de invierno, dura 25 horas.
    expect(unitCountdown(years, life, now)).toBe('2026 cae en Nochevieja, dentro de 78 d 13 h');
    expect(grainWhen(years, life, 1, 1, today, now)).toBe('Este año');
    expect(grainWhen(years, life, 0, 1, today, now)).toBe('El año pasado · desde el lunes 15 de septiembre de 2025');
    expect(grainWhen(years, life, 15, 1, today, now)).toBe('Dentro de 14 años');
  });
});

describe('segundos', () => {
  // Miércoles 14 de octubre de 2026.
  const wed = new Date(2026, 9, 14, 11, 0, 0);
  const secs = buildGrains(life, cfg, 'segundos', wed);

  it('muestra la jornada de hoy y cae un grano por segundo trabajado', () => {
    expect(secs.total).toBe(28_800);
    expect(secs.window!.day).toBe(dayFromCivil(2026, 10, 14));
    expect(fallenAt(secs, new Date(2026, 9, 14, 8, 59, 59))).toBe(0);
    expect(fallenAt(secs, wed)).toBe(7200);
    expect(fallenAt(secs, new Date(2026, 9, 14, 11, 0, 1))).toBe(7201);
    expect(fallenAt(secs, new Date(2026, 9, 14, 14, 40))).toBe(5 * 3600);
    expect(fallenAt(secs, new Date(2026, 9, 14, 19, 0))).toBe(28_800);
    expect(grainTitle(secs, 0)).toBe('09:00:00');
    expect(grainTitle(secs, 7200)).toBe('11:00:00');
    expect(fallsAt(secs, 7200)).toBe(new Date(2026, 9, 14, 11, 0, 1).getTime());
  });

  it('en fin de semana o festivo muestra la próxima jornada', () => {
    const sat = new Date(2026, 9, 17, 12, 0);
    expect(toIsoDate(windowDayFor(life, sat))).toBe('2026-10-19');
    const set = buildGrains(life, cfg, 'segundos', sat);
    expect(fallenAt(set, sat)).toBe(0);
    expect(unitCountdown(set, life, sat)).toBe('Hoy no se trabaja · tu próxima jornada empieza en 1 d 21 h');
    // 12 de octubre: festivo nacional.
    expect(toIsoDate(windowDayFor(life, new Date(2026, 9, 12, 10, 0)))).toBe('2026-10-13');
  });

  it('cuenta atrás de la jornada', () => {
    expect(unitCountdown(secs, life, new Date(2026, 9, 14, 8, 30))).toBe('Tu jornada empieza en 30 min');
    expect(unitCountdown(secs, life, wed)).toBe('Quedan 06:00:00 de jornada');
    expect(unitCountdown(secs, life, new Date(2026, 9, 14, 14, 20))).toBe('Pausa para comer · vuelves en 40 min');
    expect(unitCountdown(secs, life, new Date(2026, 9, 14, 18, 30))).toBe('Jornada terminada · mañana más');
    // El viernes, la próxima es el lunes.
    const fri = buildGrains(life, cfg, 'segundos', new Date(2026, 9, 16, 10, 0));
    expect(unitCountdown(fri, life, new Date(2026, 9, 16, 19, 0))).toBe('Jornada terminada · la próxima, el lunes 19 de octubre de 2026');
  });

  it('segundos de trabajo hasta la jubilación', () => {
    // Días laborables que quedan desde hoy, miércoles, incluido.
    const days = life.total - fallenCount(life, dayFromCivil(2026, 10, 14));
    const { left, total } = careerSeconds(life, J, wed);
    expect(left).toBe(days * 28_800 - 7200);
    expect(total).toBe(life.total * 28_800);
    // Cada segundo de jornada, uno menos; en la comida, ninguno.
    expect(careerSeconds(life, J, new Date(2026, 9, 14, 11, 0, 1)).left).toBe(left - 1);
    expect(careerSeconds(life, J, new Date(2026, 9, 14, 14, 10)).left).toBe(careerSeconds(life, J, new Date(2026, 9, 14, 14, 50)).left);
  });

  it('frases según la hora: primera hora, antes y después de comer, último minuto', () => {
    const g = (h: number, m = 0) => classifyGrain(secs, workedSecondsAt(J, at(h, m)), 0, secs.window!.day);
    expect(g(9, 10)).toBe('segundoPrimeraHora');
    expect(g(11)).toBe('segundo');
    expect(g(13, 45)).toBe('segundoAntesComer');
    expect(g(15, 20)).toBe('segundoDespuesComer');
    expect(g(17, 30)).toBe('segundoUltimaHora');
    expect(classifyGrain(secs, 28_790, 0, secs.window!.day)).toBe('segundoUltimoMinuto');
    expect(classifyGrain(secs, 100, 7200, secs.window!.day)).toBe('segundoPasado');
    // El viernes por la tarde tiene su propia frase.
    const fri = buildGrains(life, cfg, 'segundos', new Date(2026, 9, 16, 10, 0));
    expect(weekday(fri.window!.day)).toBe(5);
    expect(classifyGrain(fri, workedSecondsAt(J, at(16)), 0, fri.window!.day)).toBe('segundoViernes');
  });
});

describe('hitos y frases de cada unidad', () => {
  it('los hitos hablan en la unidad del reloj', () => {
    const sec = milestonesFor(28_800, 'segundos');
    expect(sec.find((m) => m.id === 28_800 - 61)?.title).toBe('¡Último minuto!');
    expect(sec.find((m) => m.id === 14_399)?.title).toBe('¡Ecuador de la jornada!');
    expect(sec.at(-1)?.title).toBe('¡Fin de la jornada!');
    const nom = milestonesFor(600, 'nominas');
    expect(nom.some((m) => m.title === '¡Solo quedan 14 nóminas: un año!')).toBe(true);
    expect(nom.some((m) => m.title === '¡250 nóminas cobradas!')).toBe(true);
    const yrs = milestonesFor(46, 'anios');
    expect(yrs.find((m) => m.id === 44)?.title).toBe('¡Solo te queda un año!');
    expect(milestonesFor(11_000)[0].title).toBe('¡1000 días de vida laboral!');
  });

  it('cada grano tiene frase, siempre la misma, y no se repiten entre grupos', () => {
    const all = Object.values(UNIT_PHRASES).flat();
    expect(new Set(all).size).toBe(all.length);
    const ctx = { today: dayFromCivil(2026, 10, 14), birthDay: life.birthDay, lastDay: life.lastDay, target: 10 };
    for (const unit of ['nominas', 'anios'] as const) {
      const set = buildGrains(life, cfg, unit);
      for (let id = 0; id < set.total; id += 7) {
        const p = grainPhrase(set, id, ctx);
        expect(p.length).toBeGreaterThan(10);
        expect(grainPhrase(set, id, ctx)).toBe(p);
      }
    }
  });
});
