import { civilFromDay, formatDayLong, type Life } from './dates';

const pad2 = (n: number) => String(n).padStart(2, '0');

function icsDate(dayNum: number): string {
  const { year, month, day } = civilFromDay(dayNum);
  return `${year}${pad2(month)}${pad2(day)}`;
}

function icsStamp(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}` +
    `T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
  );
}

/** Escapa caracteres reservados en valores TEXT según RFC 5545. */
function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Genera un archivo .ics (RFC 5545) de evento de día completo para la fecha de jubilación. */
export function retirementIcs(life: Life, retirementAge: number, now: Date = new Date()): string {
  const start = icsDate(life.retireDay);
  const end = icsDate(life.retireDay + 1);
  const stamp = icsStamp(now);
  const lastWork = formatDayLong(life.lastDay);
  const desc =
    `Hoy cumples ${retirementAge} años y empieza tu jubilación.\n` +
    `Tu último día laborable fue el ${lastWork.charAt(0).toLowerCase() + lastWork.slice(1)}.\n` +
    `Se acabaron el despertador, los lunes y las reuniones que podían ser un correo.\n` +
    `Generado con relojdejubilacion.com`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reloj de jubilacion//relojdejubilacion.com//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:jubilacion-${start}@relojdejubilacion.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcsText('¡Día de mi jubilación!')}`,
    `DESCRIPTION:${escapeIcsText(desc)}`,
    'URL:https://relojdejubilacion.com',
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText('¡Solo queda una semana para tu jubilación!')}`,
    'TRIGGER:-P7D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText('¡Mañana te jubilas! Último día laboral.')}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ];
  return lines.join('\r\n');
}

/** Descarga el evento .ics de la jubilación para importarlo en Google Calendar, Apple Calendar u Outlook. */
export function downloadRetirementIcs(life: Life, retirementAge: number): void {
  const ics = retirementIcs(life, retirementAge);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mi-jubilacion-${icsDate(life.retireDay)}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
