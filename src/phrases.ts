import { civilFromDay, isLeapYear, weekday } from './dates';
import { workedSecondOfDay, type GrainSet } from './units';

export type PhraseGroup =
  | 'ultimo'
  | 'pasado'
  | 'cumple'
  | 'anioNuevo'
  | 'navidad'
  | 'finde'
  | 'festivo'
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
  festivo: [
    'Festivo entre semana. El correo puede esperar. Tú también.',
    'Hoy no hay daily. Te descubres a las 9:15 esperando a que empiece igual.',
    'Festivo: el día perfecto para no mirar Teams. Lo mirarás dos veces.',
    'Puente a la vista. Alguien ya ha bloqueado el viernes en el calendario.',
    'Día festivo. Hasta el servidor de producción parece más tranquilo.',
    'Festivo. Tu jefe te escribirá «sin prisa, para mañana». Hay prisa.',
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
    'Año nuevo. Propósito: imputar las horas el mismo día. Duración estimada: 4 días.',
    'Año nuevo, mismo Excel de seguimiento.',
    'Año nuevo. Mañana te esperan 200 correos de «¡Feliz año!» y uno importante escondido entre ellos.',
    'Año nuevo. El calendario está en blanco. Por poco tiempo.',
    'Año nuevo. Nuevo año fiscal, nuevo organigrama, mismos problemas.',
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
  /** Si se indica, los festivos entre semana tienen sus propias frases. */
  isWorkday?: (day: number) => boolean;
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
  if (month === 1 && dom === 1) return 'anioNuevo';
  if (month === 12 && dom >= 24) return 'navidad';
  const wd = weekday(day);
  if (wd === 0 || wd === 6) return 'finde';
  if (ctx.isWorkday && !ctx.isWorkday(day)) return 'festivo';
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

// ---------------------------------------------------------------- otras unidades

export type UnitPhraseGroup =
  | 'nomina'
  | 'nominaExtra'
  | 'nominaPrimera'
  | 'nominaUltima'
  | 'nominaPasada'
  | 'anio'
  | 'anioActual'
  | 'anioPrimero'
  | 'anioUltimo'
  | 'anioPasado'
  | 'segundo'
  | 'segundoPrimeraHora'
  | 'segundoAntesComer'
  | 'segundoDespuesComer'
  | 'segundoViernes'
  | 'segundoUltimaHora'
  | 'segundoUltimoMinuto'
  | 'segundoPasado';

export const UNIT_PHRASES: Record<UnitPhraseGroup, readonly string[]> = {
  nomina: [
    'Llegará el día 30 y se irá el día 2: hipoteca, luz y tres suscripciones que no usas.',
    'Bruto, neto y una retención que nadie en la oficina sabe explicar.',
    'La mirarás en la app del banco tres veces, por si acaso.',
    'Alguien preguntará «¿ya os ha llegado?» a las 8:01.',
    'IRPF: el compañero de piso que nunca friega y siempre cobra primero.',
    'Durará exactamente lo que tarde en llegar la factura de la luz.',
    'Subida salarial prevista: la del IPC, si hay suerte y viento a favor.',
  ],
  nominaExtra: [
    'La paga extra. Ya la has gastado mentalmente tres veces.',
    'Paga extra: el único correo de RR. HH. que todo el mundo lee entero.',
    'Paga extra. Hacienda también la estaba esperando.',
  ],
  nominaPrimera: ['Tu primera nómina. La guardaste en PDF como si fuera un diploma.'],
  nominaUltima: ['Tu última nómina. A partir de aquí, la pensión: mismo día de cobro, cero reuniones.'],
  nominaPasada: [
    'Cobrada y gastada. En ese orden y bastante seguido.',
    'Ya no está. Ni en la cuenta ni en tu memoria.',
    'Se fue entera en algo que ahora mismo no recuerdas.',
    'Directa a la hipoteca, al alquiler o a ambos.',
  ],
  anio: [
    'Doce meses, dos evaluaciones de desempeño y un cambio de organigrama.',
    'Un año más de «este año sí que me apunto al gimnasio».',
    'Habrá una reorganización. Te cambiarán de mesa, no de sueldo.',
    'Una cena de Navidad, un agosto y la misma impresora atascada.',
    'Alguien anunciará la transformación digital. Otra vez.',
    'Nuevo año, nuevo plan estratégico, mismo Excel de seguimiento.',
  ],
  anioActual: [
    'Este año. Aún estás a tiempo de cumplir algún propósito. Uno.',
    'El año en curso. Cae entero en Nochevieja, con las uvas.',
  ],
  anioPrimero: ['Tu primer año. Todo era nuevo, hasta la máquina de café.'],
  anioUltimo: ['Tu último año. Lo pasarás contando los días. Literalmente: tienes una web para eso.'],
  anioPasado: [
    'Pasó volando. Como todos, pero ese más.',
    'Un año menos. No lo echarás de menos, salvo las vacaciones.',
    'Se fue entero en reuniones de seguimiento.',
  ],
  segundo: [
    'Un segundo. Lo que tarda Teams en decir que alguien está escribiendo.',
    'Tiempo suficiente para fingir que lees el correo.',
    'Un segundo de trabajo. Bueno, de estar conectado.',
    'En este segundo alguien, en algún sitio, está diciendo «¿me oís?».',
    'Lo que dura la paciencia en una daily que ya va por el minuto 40.',
    'Un segundo imputable. Ánimo con el parte de horas.',
  ],
  segundoPrimeraHora: ['Primera hora: café, correo y la mirada perdida.', 'Aún no has abierto ningún Excel. Disfrútalo.'],
  segundoAntesComer: ['¿Qué comemos hoy? La única reunión productiva del día.', 'Cuenta atrás para el táper.'],
  segundoDespuesComer: ['Digestión en curso. Los párpados pesan más que el proyecto.', 'La hora más larga del día. Científicamente.'],
  segundoViernes: ['Viernes por la tarde: los segundos más lentos de la semana.'],
  segundoUltimaHora: ['Última hora: alguien convocará una reunión «rápida».', 'Ya tienes la chaqueta medio puesta. Mentalmente.'],
  segundoUltimoMinuto: ['Último minuto. No abras ningún correo nuevo.'],
  segundoPasado: [
    'Ese segundo ya es historia. Como el café de esta mañana.',
    'Pasó y ni lo notaste, que es lo mejor que le puede pasar a un segundo de trabajo.',
    'Uno menos. Quedan muchos, pero uno menos.',
  ],
};

/** Grupo de frases de un grano que no es un día laborable. `target`: primer grano sin caer. */
export function classifyGrain(set: GrainSet, id: number, target: number, today: number): UnitPhraseGroup {
  const day = set.days[id];
  if (set.unit === 'nominas') {
    if (id === set.total - 1) return 'nominaUltima';
    if (id === 0) return 'nominaPrimera';
    if (id < target) return 'nominaPasada';
    return set.extra?.[id] ? 'nominaExtra' : 'nomina';
  }
  if (set.unit === 'anios') {
    if (id === set.total - 1) return 'anioUltimo';
    if (id === 0) return 'anioPrimero';
    const year = civilFromDay(day).year;
    const now = civilFromDay(today).year;
    if (year === now) return 'anioActual';
    return year < now ? 'anioPasado' : 'anio';
  }
  // Segundos de la jornada
  if (id < target) return 'segundoPasado';
  const j = set.window!.jornada;
  const sec = workedSecondOfDay(j, id);
  if (set.total - id <= 60) return 'segundoUltimoMinuto';
  if (j.end * 60 - sec <= 3600) return 'segundoUltimaHora';
  if (sec - j.start * 60 < 3600) return 'segundoPrimeraHora';
  const hasBreak = j.breakEnd > j.breakStart;
  if (hasBreak && sec < j.breakStart * 60 && j.breakStart * 60 - sec <= 1800) return 'segundoAntesComer';
  if (hasBreak && sec >= j.breakEnd * 60) {
    if (weekday(day) === 5) return 'segundoViernes';
    if (sec - j.breakEnd * 60 < 3600) return 'segundoDespuesComer';
  }
  return 'segundo';
}

/** Frase de cualquier grano, en cualquier unidad. El mismo grano dice siempre lo mismo. */
export function grainPhrase(set: GrainSet, id: number, ctx: PhraseContext & { target: number }): string {
  if (set.unit === 'dias') return phraseFor(set.days[id], ctx);
  const group = classifyGrain(set, id, ctx.target, ctx.today);
  const list = UNIT_PHRASES[group];
  return list[hash32(id * 31 + set.days[id] + group.length) % list.length];
}
