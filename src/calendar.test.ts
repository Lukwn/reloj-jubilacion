import { describe, expect, it } from 'vitest';
import { retirementIcs } from './calendar';
import { buildLife } from './dates';

describe('calendario (.ics)', () => {
  it('genera un evento RFC 5545 válido de día completo para la jubilación', () => {
    const life = buildLife({
      birthDate: '1995-05-10',
      retirementAge: 67,
      workStartDate: '2020-01-15',
    });
    const ics = retirementIcs(life, 67, new Date(Date.UTC(2026, 10, 20, 18, 0, 0)));

    expect(ics.includes('\r\n')).toBe(true);
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
    expect(ics).toContain('UID:jubilacion-20620510@relojdejubilacion.com\r\n');
    expect(ics).toContain('DTSTAMP:20261120T180000Z\r\n');
    expect(ics).toContain('DTSTART;VALUE=DATE:20620510\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20620511\r\n');
    expect(ics).toContain('SUMMARY:¡Día de mi jubilación!\r\n');
    expect(ics).toContain('67 años');
    expect(ics).toContain('TRIGGER:-P7D\r\n');
    expect(ics).toContain('TRIGGER:-P1D\r\n');
  });
});
