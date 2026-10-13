import { civilFromDay, dayFromCivil, isLeapYear, weekday } from './dates';

export type PhraseGroup =
  | 'ultimo'
  | 'pasado'
  | 'cumple'
  | 'anioNuevo'
  | 'navidad'
  | 'finde'
  | 'agosto'
  | 'lunes'
  | 'viernes'
  | 'generico';

export const PHRASES: Record<PhraseGroup, readonly string[]> = {
  lunes: [
    'El café de máquina hoy sabe a resignación.',
    'Tres reuniones de «alineamiento» y ninguna línea recta.',
    'Alguien te preguntará «¿qué tal el finde?» y no podrás ser sincero.',
    'Bandeja de entrada: 147 correos, 3 importantes, 0 encontrados.',
    'La daily durará 45 minutos. Es daily, no hourly, pero bueno.',
    'Tu contraseña ha caducado y la nueva no puede parecerse a las 12 anteriores.',
    'El cliente ha tenido una idea durante el fin de semana.',
    'El portátil decide actualizarse justo antes de la demo.',
  ],
  viernes: [
    'Alguien propondrá desplegar a producción. Nadie lo detendrá.',
    'Reunión a las 17:30 «solo para cerrar un par de cosillas».',
    'Imputas las horas de toda la semana de memoria. Ficción histórica.',
    '«Solo es un cambio pequeñito», dijo el cliente a las 14:55.',
    'El pipeline falla y el único que sabe arreglarlo ya está en la playa.',
    'Jornada intensiva en teoría, extensiva en la práctica.',
    'Alguien escribe «lo vemos el lunes». El lunes nadie lo ve.',
    'Despliegue en viernes: valiente, innecesario y muy comentado el lunes.',
  ],
  finde: [
    'Miras el móvil del trabajo «solo un segundo». Error.',
    'Hoy nadie te pregunta «¿me oís?». Disfruta del silencio.',
    'Sueñas con un Excel lleno de celdas combinadas. Te despiertas sudando.',
    'El portátil del curro te mira desde la mochila. No le devuelvas la mirada.',
    'Un día que no se imputa a ningún proyecto. Puro lujo.',
    'Intentas explicar a tu familia a qué te dedicas. Tampoco esta vez.',
    'Siesta con la cámara apagada, como en las reuniones, pero legal.',
    'Llega un correo del cliente con «URGENTE» en el asunto. Será urgente el lunes.',
  ],
  agosto: [
    'La oficina está vacía y el aire acondicionado, a 17 grados.',
    'Respuesta automática: «Fuera hasta septiembre (emocionalmente, hasta octubre)».',
    'Eres la única persona que queda en el proyecto. Enhorabuena, eres el proyecto.',
    'Nadie contesta, nadie decide, todo espera a septiembre.',
    'El cliente también está de vacaciones. Paz mundial temporal.',
    'Cuarenta grados, chanclas mentales y una VPN que no conecta.',
  ],
  navidad: [
    'Turrón en la cocina de la oficina y un amigo invisible que no lo es tanto.',
    '«Lo cerramos antes de fin de año», dijeron en septiembre.',
    'Cena de empresa: tres horas hablando de trabajo, pero con vino.',
    'Alguien en la cena familiar te pregunta si has pensado en opositar.',
    'Congelación de código. Y de neuronas.',
    'Todo el mundo de vacaciones menos el servidor de producción.',
  ],
  anioNuevo: [
    'Primer día laborable del año. Propósito: imputar las horas el mismo día. Duración estimada: 4 días.',
    'Primer día laborable del año. Año nuevo, mismo Excel de seguimiento.',
    'Primer día laborable del año. 200 correos de «¡Feliz año!» y uno importante escondido entre ellos.',
    'Primer día laborable del año. El calendario está en blanco. Por poco tiempo.',
    'Primer día laborable del año. Nuevo año fiscal, nuevo organigrama, mismos problemas.',
  ],
  cumple: [
    'Tu cumpleaños. Tarta en la oficina a las 11 y una reunión a las 11:05.',
    'Tu cumpleaños. Un año más de experiencia, ninguna subida de sueldo.',
    'Tu cumpleaños. Felicitación automática de RR. HH. con tu nombre mal escrito.',
    'Tu cumpleaños. Hoy se te perdona llegar tarde a la daily. Solo hoy.',
    'Tu cumpleaños. Pides un deseo: que nadie diga «una cosilla rápida».',
  ],
  ultimo: [
    'Último día antes de la jubilación. Devuelves el portátil, desinstalas Teams y nunca, nunca más imputas una hora.',
  ],
  pasado: [
    'Ese ya no vuelve.',
    'Ya pasó. Seguramente lo imputaste mal.',
    'Superado. No recuerdas nada de ese día, y es mejor así.',
    'Este ya está en el bulbo de abajo. Descanse en paz.',
    'Un día más en el contador. Ni Jira se acuerda.',
    'Lo pasaste diciendo «¿me oís? ¿se ve mi pantalla?».',
    'Aquel día alguien dijo «esto lo hacemos en una tarde». Spoiler: no.',
    'Probablemente hubo una reunión que podía ser un correo.',
    'Gastado. Sin reembolso ni devolución.',
    'Se fue, como los cafés gratis de la oficina antigua.',
  ],
  generico: [
    'Seguramente una reunión que podía ser un correo.',
    'Una daily de 15 minutos que durará una hora.',
    'Alguien dirá «¿me oís?» en Teams. Tres veces.',
    'Moverás una tarea de «En curso» a «En curso (de verdad)».',
    'Imputarás 8 horas a un proyecto en el que trabajaste 20 minutos. O al revés.',
    'Café de máquina: marrón, caliente y vagamente relacionado con el café.',
    'El cliente dirá: «Solo es un cambio pequeñito». No lo será.',
    'Un PowerPoint de 40 diapositivas para decir que vamos bien.',
    'Te pondrán en copia de un hilo de 63 correos. Contexto: ninguno.',
    'Alguien compartirá pantalla y se le verá el WhatsApp.',
    'Aprenderás un acrónimo nuevo. Nadie sabrá qué significa.',
    'La VPN se caerá justo cuando estés a punto de entregar.',
    'Te preguntarán «¿tienes un minuto?». Nunca es un minuto.',
    'Reunión para preparar la reunión de seguimiento de la reunión.',
    'Actualizarás el Excel de seguimiento del Excel de seguimiento.',
    'Alguien dirá «sinergias» sin ninguna ironía.',
  ],
};

export interface PhraseContext {
  today: number;
  birthDay: number;
  lastDay: number;
  /** Si se indica, «año nuevo» es el primer día laborable del año en vez del 1 de enero. */
  isWorkday?: (day: number) => boolean;
}

function isFirstWorkdayOfYear(day: number, isWorkday: (day: number) => boolean): boolean {
  const { year } = civilFromDay(day);
  for (let d = dayFromCivil(year, 1, 1); d < day; d++) if (isWorkday(d)) return false;
  return isWorkday(day);
}

function isBirthday(day: number, birthDay: number): boolean {
  const d = civilFromDay(day);
  const b = civilFromDay(birthDay);
  if (b.month === 2 && b.day === 29 && !isLeapYear(d.year)) return d.month === 2 && d.day === 28;
  return d.month === b.month && d.day === b.day;
}

export function classifyDay(day: number, ctx: PhraseContext): PhraseGroup {
  if (day === ctx.lastDay) return 'ultimo';
  if (day < ctx.today) return 'pasado';
  if (isBirthday(day, ctx.birthDay)) return 'cumple';
  const { month, day: dom } = civilFromDay(day);
  if (ctx.isWorkday ? month === 1 && isFirstWorkdayOfYear(day, ctx.isWorkday) : month === 1 && dom === 1) {
    return 'anioNuevo';
  }
  if (month === 12 && dom >= 24) return 'navidad';
  const wd = weekday(day);
  if (wd === 0 || wd === 6) return 'finde';
  if (month === 8) return 'agosto';
  if (wd === 1) return 'lunes';
  if (wd === 5) return 'viernes';
  return 'generico';
}

export function hash32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Misma fecha, misma frase: la elección depende solo del día y su grupo. */
export function phraseFor(day: number, ctx: PhraseContext): string {
  const group = classifyDay(day, ctx);
  const list = PHRASES[group];
  return list[hash32(day * 31 + group.length) % list.length];
}
