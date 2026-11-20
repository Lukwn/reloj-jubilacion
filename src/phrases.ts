import { civilFromDay, isLeapYear, weekday } from './dates';
import { formatClock, workedSecondOfDay, type GrainSet } from './units';

export type PhraseGroup =
  | 'ultimo'
  | 'pasado'
  | 'cumple'
  | 'anioNuevo'
  | 'navidad'
  | 'loteria'
  | 'bisiesto'
  | 'finde'
  | 'festivo'
  | 'agosto'
  | 'septiembre'
  | 'cuestaEnero'
  | 'trece'
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
    'Lunes a las 9:00: todavía con la inercia del domingo y ya te piden un presupuesto.',
    'Alguien llega con una energía sospechosamente alta para ser lunes.',
    'Empiezas la semana diciendo «esta vez me organizo». A las 10:15 se rompe el plan.',
    'El atasco de los lunes debería computar como hora extra.',
    'Cinco días para el viernes. Dicho así parece poco; vivido, no tanto.',
    'Primer correo del lunes: «Como comentamos el viernes…». Nadie se acuerda.',
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
    'A partir de las 13:00 tu cerebro ya ha fichado la salida.',
    'Viernes: el día oficial de posponer problemas con elegancia.',
    '«Te mando esto para que lo tengas en el radar». El radar está apagado hasta el lunes.',
    'El café de los viernes sabe distinto. Casi a libertad.',
    'Hoy nadie empieza nada serio después de las doce. Regla no escrita.',
    'Plan de viernes: cerrar 24 pestañas del navegador sin guardar ninguna.',
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
    'Despertador apagado. Solo por eso ya merece la pena existir.',
    'Domingo a las 19:00: esa nostalgia rara que tiene nombre de lunes.',
    'Hoy tu única reunión es decidir qué se cena.',
    'Ni una notificación de correo en todo el día. Ciencia ficción.',
    'Batería del portátil de trabajo al 100 % porque ni lo has abierto.',
  ],
  festivo: [
    'Festivo entre semana. El correo puede esperar. Tú también.',
    'Hoy no hay daily. Te descubres a las 9:15 esperando a que empiece igual.',
    'Festivo: el día perfecto para no mirar Teams. Lo mirarás dos veces.',
    'Puente a la vista. Alguien ya ha bloqueado el viernes en el calendario.',
    'Día festivo. Hasta el servidor de producción parece más tranquilo.',
    'Festivo. Tu jefe te escribirá «sin prisa, para mañana». Hay prisa.',
    'Un festivo en miércoles parte la semana en dos trozos soportables.',
    'Lo mejor de un festivo es levantarte a la hora que te da la gana y desayunar sin mirar el reloj.',
    'Festivo nacional: hoy no se trabaja, aunque la cabeza a veces vaya en piloto automático.',
    'Alguien de otro país te convoca a una reunión hoy porque allí no es fiesta.',
  ],
  agosto: [
    'La oficina está vacía y el aire acondicionado, a 17 grados.',
    'Respuesta automática: «Fuera hasta septiembre (emocionalmente, hasta octubre)».',
    'Eres la única persona que queda en el proyecto. Enhorabuena, eres el proyecto.',
    'Nadie contesta, nadie decide, todo espera a septiembre.',
    'El cliente también está de vacaciones. Paz mundial temporal.',
    'Cuarenta grados, chanclas mentales y una VPN que no conecta.',
    'Agosto laboral: el mes en el que hasta el tráfico te respeta.',
    'Mandas un correo y recibes cinco respuestas automáticas de «Fuera de la oficina».',
    'Guerra civil silenciosa por el mando del aire acondicionado.',
    'Trabajar en agosto tiene una ventaja: nadie te interrumpe. Y un problema: estás trabajando en agosto.',
  ],
  septiembre: [
    'Vuelta de vacaciones: no recuerdas ni tu contraseña ni a qué te dedicas.',
    'Septiembre: todo lo que se dejó «para después del verano» llega hoy a la vez.',
    'Abres la bandeja de entrada tras las vacaciones y te planteas cambiar de identidad.',
    '«¿Qué tal las vacaciones?» — respuesta oficial: «cortas».',
    'Tu cerebro sigue en la playa, pero tu cuerpo está en una reunión de seguimiento.',
    'Septiembre es el lunes de los meses.',
  ],
  cuestaEnero: [
    'Cuesta de enero: más empinada que el puerto de Navacerrada.',
    'Enero dura 74 días. Científicamente comprobado por tu cuenta corriente.',
    'Todavía quedan polvorones en la cocina de la oficina. Nadie se atreve a tocarlos.',
    'Propósito de enero: no estresarse. Incumplido a las 9:20.',
    'Volviendo del roscón con ganas de volver a las vacaciones de Navidad.',
    'Enero: pagas las cenas de diciembre con la ilusión de febrero.',
  ],
  trece: [
    'Martes o viernes 13. Hoy ni despliegues, ni toques el Excel maestro, ni preguntes.',
    'Día 13 gafado: si algo funciona hoy, no lo mires demasiado fijo.',
    'Hoy es de esos días en los que se cae internet justo al guardar el documento.',
    'Día 13: toca madera (o el escritorio de melamina de la oficina).',
    'Si hoy te dicen «es un cambio sin riesgo», desconfía el doble.',
  ],
  loteria: [
    '22 de diciembre: hoy trabajas con la carta de dimisión guardada en borradores.',
    'Día de la Lotería de Navidad. A las 13:00 vuelve la salud y la rutina.',
    'Suenan los niños de San Ildefonso de fondo mientras finges mirar una hoja de cálculo.',
    'Hoy todo el mundo en la oficina tiene «lo importante es tener salud» preparado en el portapapeles.',
    'Si toca el Gordo, este reloj de jubilación se queda sin sentido en cinco minutos.',
  ],
  bisiesto: [
    '29 de febrero: un día extra de trabajo cortesía del calendario gregoriano.',
    'Año bisiesto: trabajas un día más por el mismo sueldo anual. Detallazo.',
    '29 de febrero. Un grano rarísimo que solo aparece cada cuatro años.',
    'Día extra del año. No se paga aparte, pero cuenta igual para jubilarse.',
  ],
  navidad: [
    'Turrón en la cocina de la oficina y un amigo invisible que no lo es tanto.',
    '«Lo cerramos antes de fin de año», dijeron en septiembre.',
    'Cena de empresa: tres horas hablando de trabajo, pero con vino.',
    'Alguien en la cena familiar te pregunta si has pensado en opositar.',
    'Congelación de código. Y de neuronas.',
    'Todo el mundo de vacaciones menos el servidor de producción.',
    'Cesta de Navidad: tres botellas, un fuet y la confirmación de que no habrá bonus.',
    'Últimos días del año: nadie responde correos, solo mandan felicitaciones con GIFs.',
    'Villancicos en la radio y un informe pendiente desde noviembre.',
  ],
  anioNuevo: [
    'Año nuevo. Propósito: imputar las horas el mismo día. Duración estimada: 4 días.',
    'Año nuevo, mismo Excel de seguimiento.',
    'Año nuevo. Mañana te esperan 200 correos de «¡Feliz año!» y uno importante escondido entre ellos.',
    'Año nuevo. El calendario está en blanco. Por poco tiempo.',
    'Año nuevo. Nuevo año fiscal, nuevo organigrama, mismos problemas.',
    '1 de enero: hoy eres un año más cerca de la jubilación. Feliz año.',
    'Año nuevo. Prometes desconectar a tu hora. Spoiler: en febrero se te olvida.',
  ],
  cumple: [
    'Tu cumpleaños. Tarta en la oficina a las 11 y una reunión a las 11:05.',
    'Tu cumpleaños. Un año más de experiencia, ninguna subida de sueldo.',
    'Tu cumpleaños. Felicitación automática de RR. HH. con tu nombre mal escrito.',
    'Tu cumpleaños. Hoy se te perdona llegar tarde a la daily. Solo hoy.',
    'Tu cumpleaños. Pides un deseo: que nadie diga «una cosilla rápida».',
    'Tu cumpleaños. Te cantan cumpleaños feliz de forma incómoda junto a la máquina de café.',
    'Tu cumpleaños. Un año más sabio y exactamente un año más cerca de la pensión.',
  ],
  ultimo: [
    'Último día antes de la jubilación. Devuelves el portátil, desinstalas Teams y nunca, nunca más imputas una hora.',
    'Tu último día laboral. Hoy sí que puedes decir exactamente lo que piensas en la reunión.',
    'Fin de trayecto. Mañana el despertador no suena y el lunes pasa a ser un día cualquiera.',
  ],
  pasado: [
    'Ese ya no vuelve.',
    'Ya pasó. Seguramente lo imputaste mal.',
    'Superado. No recuerdas nada de ese día, y es mejor así.',
    'Este ya está abajo del todo. Descanse en paz.',
    'Un día más en el contador. Ni Jira se acuerda.',
    'Lo pasaste diciendo «¿me oís? ¿se ve mi pantalla?».',
    'Aquel día alguien dijo «esto lo hacemos en una tarde». Spoiler: no.',
    'Probablemente hubo una reunión que podía ser un correo.',
    'Gastado. Sin reembolso ni devolución.',
    'Se fue, como los cafés gratis de la oficina antigua.',
    'Sobreviviste a aquel día a base de café y pura inercia.',
    'Ese día parecía eterno y ahora es solo un grano de arena.',
    'Cotizado y archivado. La Seguridad Social toma nota.',
    'Aquel día prometiste acostarte pronto. Tampoco lo hiciste.',
    'Tachado del calendario para siempre. Ni tan mal.',
    'Un día trabajado que ya no te puede quitar nadie.',
    'Seguro que ese día miraste la hora a las 11:15 pensando que ya era la una.',
    'Pasó sin gloria, pero suma igual para la jubilación.',
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
    'La impresora se atascará justo cuando lleves prisa. Tiene sensor de estrés.',
    'Un correo que empieza por «Perdona que te moleste» y molesta bastante.',
    'Recibirás una invitación de calendario sin agenda, sin contexto y a la hora de comer.',
    'Pasarás veinte minutos buscando un archivo que se llamaba «FINAL_v3_definitivo_OK».',
    'Alguien responderá «Recibido, gracias» a toda la empresa por error.',
    'El microondas de la oficina olerá a pescado misterioso.',
    'Tu silla hará un ruido raro justo cuando haya silencio absoluto.',
    'Alguien preguntará «¿esto para cuándo está?» antes de explicar qué es «esto».',
    'Comerás de táper mirando un vídeo de diez minutos que dura veinte.',
    'Hoy descubrirás que el problema que llevas horas investigando era una coma.',
    'Un correo con «Te pongo en copia por visibilidad». Traducción: ahora también es marrón tuyo.',
    'Media jornada buscando a la única persona que tiene permisos para aprobar algo.',
  ],
};

// ---------------------------------------------------------------- combinadores deterministas (días)

const DAY_FUTURE_OPENERS = [
  'Alguien convocará una reunión «de cinco minutos»',
  'Recibirás un correo con «URGENTE» en mayúsculas',
  'Se caerá el wifi de la oficina',
  'Te meterán en un grupo nuevo de WhatsApp del curro',
  'Tu jefe empezará una frase con «ya que estás»',
  'Abrirás un Excel de hace cuatro años que nadie se atreve a tocar',
  'Llegará un cambio de última hora a diez minutos de salir',
  'La máquina de café se quedará sin vasos',
  'Alguien dirá «esto en una tarde sale»',
  'Te pondrán en copia de un hilo eterno',
  'Desaparecerá tu bolígrafo favorito de la mesa',
  'Alguien propondrá «darle una vuelta» a algo que ya estaba acabado',
  'El aire acondicionado entrará en modo Polo Norte',
  'Tendrás que explicar por cuarta vez lo que ya pusiste en un correo',
] as const;

const DAY_FUTURE_ENDINGS = [
  'y mirarás cuántos días quedan en esta web.',
  'mientras asientes con cara muy profesional.',
  'y misteriosamente nadie sabrá quién lo pidió.',
  'con el entusiasmo de un martes lluvioso.',
  'y en tu cabeza ya sonarán las olas del mar.',
  'sin que nadie se ofrezca voluntario.',
  'como manda la tradición laboral.',
  'y decidirás que hoy tampoco toca hacer carrera.',
  'justo cuando por fin te habías concentrado.',
  'y te plantearás seriamente abrir un chiringuito.',
  'mientras tomas el tercer café del día.',
  'con cero pruebas y cero dudas de que no hacía falta.',
] as const;

const DAY_PAST_OPENERS = [
  'Aquel día alguien pidió «una cosilla rápida»',
  'Ese día te liaron con una reunión sin agenda',
  'Aquel día el café no hizo efecto',
  'Ese día prometiste salir puntual',
  'Aquel día cerraste veinte pestañas sin mirar',
  'Ese día peleaste con un archivo llamado «definitivo_v7»',
  'Aquel día miraste el reloj cada doce minutos',
  'Ese día sobreviviste a tres correos con «¿cómo vamos?»',
  'Aquel día el tráfico estuvo peor que tu ánimo',
  'Ese día trabajaste en modo automático',
] as const;

const DAY_PAST_ENDINGS = [
  'pero ya es historia y cotizó igual.',
  'y ahora ni te acuerdas del nombre del proyecto.',
  'y aquí sigue el reloj, un grano más cerca del final.',
  'aunque al menos ya no tienes que repetirlo.',
  'y saliste vivo, que ya es bastante.',
  'pero ya está archivado en el fondo del reloj.',
  'y hoy solo queda la anécdota (ni eso).',
  'pero un día menos en la cuenta total.',
] as const;

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

/** Edad cumplida en un día civil concreto. */
function ageOnDay(day: number, birthDay: number): number {
  const d = civilFromDay(day);
  const b = civilFromDay(birthDay);
  let age = d.year - b.year;
  if (d.month < b.month || (d.month === b.month && d.day < b.day)) age--;
  return Math.max(0, age);
}

const MONTH_NAMES = [
  '',
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

export function classifyDay(day: number, ctx: PhraseContext): PhraseGroup {
  if (day === ctx.lastDay) return 'ultimo';
  if (day < ctx.today) return 'pasado';
  if (isBirthday(day, ctx.birthDay)) return 'cumple';
  const { month, day: dom } = civilFromDay(day);
  if (month === 1 && dom === 1) return 'anioNuevo';
  if (month === 12 && dom === 22) return 'loteria';
  if (month === 12 && dom >= 24) return 'navidad';
  if (month === 2 && dom === 29) return 'bisiesto';
  const wd = weekday(day);
  if (wd === 0 || wd === 6) return 'finde';
  if (ctx.isWorkday && !ctx.isWorkday(day)) return 'festivo';
  if (month === 8) return 'agosto';
  if (month === 9 && dom <= 10) return 'septiembre';
  if (month === 1 && dom >= 7 && dom <= 20) return 'cuestaEnero';
  if (dom === 13 && (wd === 2 || wd === 5)) return 'trece';
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

/** Frases dinámicas con datos reales del calendario o del usuario para días concretos. */
function dynamicDayPhrase(day: number, group: PhraseGroup, ctx: PhraseContext): string | null {
  const { year, month } = civilFromDay(day);
  const age = ageOnDay(day, ctx.birthDay);
  const left = ctx.lastDay - day;
  const h = hash32(day * 97 + 19);

  // Hitos exactos de días restantes antes de jubilarse.
  if (day >= ctx.today && day < ctx.lastDay) {
    if (left === 1) return 'Penúltimo día laboral. Mañana ya puedes dejar el café a medias y no volver.';
    if (left === 10) return 'Solo quedan 10 días. Ya puedes contar los que faltan con los dedos.';
    if (left === 30) return 'Te queda un mes exacto. La bandeja de entrada ya no te da ni miedo.';
    if (left === 100) return 'Quedan exactamente 100 días. Cien amaneceres y se acabó el despertador.';
    if (left === 365) return 'Falta justo un año para tu jubilación. El último verano trabajando.';
    if (left === 500) return 'Quedan 500 días justos. Ya se ve la meta al fondo del pasillo.';
    if (left === 1000) return 'Quedan exactamente 1.000 días. A partir de aquí ya bajamos de cuatro cifras.';
  }

  // Cumpleaños personalizado con la edad real (la mitad de los cumpleaños).
  if (group === 'cumple' && age > 0 && h % 2 === 0) {
    const opts = [
      `Cumples ${age} años. Tarta en la oficina a las 11 y una reunión sorpresa a las 11:05.`,
      `Tus ${age} años: más experiencia en el currículum, misma silla giratoria.`,
      `Hoy caen ${age} primaveras. Pide un deseo: que nadie diga «una cosilla rápida».`,
      `¡${age} años! Felicitación automática de RR. HH. y un año menos para la pensión.`,
    ];
    return opts[(h >>> 4) % opts.length];
  }

  // Días lejanos en el futuro (2040+) en ~18 % de los días genéricos/lunes/viernes.
  if ((group === 'generico' || group === 'lunes' || group === 'viernes') && year >= 2040 && h % 11 === 0) {
    const opts = [
      `En ${year} tendrás ${age} años. Habrá robots haciendo café y alguien seguirá pidiendo «un Excel rapidito».`,
      `${MONTH_NAMES[month].charAt(0).toUpperCase() + MONTH_NAMES[month].slice(1)} de ${year}: con ${age} años y seguro que sigue existiendo una reunión semanal de seguimiento.`,
      `Año ${year}, con ${age} años. Prometieron semana de cuatro días y aquí sigues mirando el calendario.`,
    ];
    return opts[(h >>> 5) % opts.length];
  }

  // Combinador determinista (~32 %) solo en grupos muy poblados (generico, pasado, lunes, viernes).
  if ((group === 'generico' || group === 'lunes' || group === 'viernes') && h % 3 === 0) {
    const a = DAY_FUTURE_OPENERS[(h >>> 3) % DAY_FUTURE_OPENERS.length];
    const b = DAY_FUTURE_ENDINGS[(h >>> 9) % DAY_FUTURE_ENDINGS.length];
    return `${a} ${b}`;
  }
  if (group === 'pasado' && h % 3 === 0) {
    const a = DAY_PAST_OPENERS[(h >>> 3) % DAY_PAST_OPENERS.length];
    const b = DAY_PAST_ENDINGS[(h >>> 9) % DAY_PAST_ENDINGS.length];
    return `${a}, ${b}`;
  }

  return null;
}

/** Misma fecha, misma frase: la elección depende solo del día, su contexto y su grupo. */
export function phraseFor(day: number, ctx: PhraseContext): string {
  const group = classifyDay(day, ctx);
  const dyn = dynamicDayPhrase(day, group, ctx);
  if (dyn) return dyn;
  const list = PHRASES[group];
  return list[hash32(day * 31 + group.length) % list.length];
}

// ---------------------------------------------------------------- otras unidades

export type UnitPhraseGroup =
  | 'nomina'
  | 'nominaExtra'
  | 'nominaExtraPasada'
  | 'nominaPrimera'
  | 'nominaUltima'
  | 'nominaUltimaCobrada'
  | 'nominaPasada'
  | 'anio'
  | 'anioActual'
  | 'anioPrimero'
  | 'anioUltimo'
  | 'anioBisiesto'
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
    'Treinta días de esfuerzo resumidos en un PDF protegido con contraseña.',
    'Entrará por la puerta grande y saldrá por la domiciliación bancaria.',
    'El único día del mes en el que abrir la app del banco no da miedo.',
    'Concepto: salario base, plus indefinido y descuento misterioso.',
    'Te sentirás rico durante exactamente 48 horas.',
    'Prometerás apartar un buen pellizco. El supermercado tendrá otros planes.',
    'Llegará justo cuando ya estabas haciendo malabares con el saldo.',
    'La notificación favorita del mes, por encima incluso del «paquete entregado».',
    'Cotización a la Seguridad Social: un ladrillito más para la futura pensión.',
    'El mes se hizo largo, pero esta moneda entra entera en tu pila.',
    'Otra nómina más. Nunca parece suficiente, pero menos da una piedra.',
  ],
  nominaExtra: [
    'La paga extra. Ya la has gastado mentalmente tres veces.',
    'Paga extra: el único correo de RR. HH. que todo el mundo lee entero.',
    'Paga extra. Hacienda también la estaba esperando.',
    'Moneda dorada especial: dura el doble de ilusión y la mitad de lo previsto.',
    'Paga extra a la vista. El carrito de compras online ya se está frotando las manos.',
    'Ese empujón semestral que arregla el año (hasta el día 10 del mes siguiente).',
    'Paga extra: motivo oficial por el que junio y diciembre son mejores meses.',
    'Mitad ahorro, mitad capricho… y al final todo para un imprevisto del coche.',
  ],
  nominaExtraPasada: [
    'Paga extra cobrada. Voló entre vacaciones, regalos o un arreglo inesperado.',
    'Aquella paga extra dio alegría dos días y luego desapareció sin hacer ruido.',
    'Extra ya disfrutada. Hacienda se llevó su pellizco puntual, como siempre.',
    'Una de las buenas: brilló en la cuenta y duró lo que dura un helado en agosto.',
    'Paga extra amortizada. Seguro que tapó algún agujero con estilo.',
    'De esa paga extra solo queda el recuerdo y algún cargo en la tarjeta.',
    'Moneda extra en la saca: de las que dan gusto ver en el histórico.',
    'Se fue rápido, pero qué bien sentó ver el saldo ese día.',
  ],
  nominaPrimera: [
    'Tu primera nómina. La guardaste en PDF como si fuera un diploma.',
    'La número uno. Con esta empezó la pila (y tu relación formal con el IRPF).',
  ],
  nominaUltima: [
    'Tu última nómina. A partir de aquí, la pensión: mismo día de cobro, cero reuniones.',
    'La última moneda del racimo. Después de esta, a cobrar sin fichar.',
  ],
  nominaUltimaCobrada: [
    'La última que ha caído. Todavía huele a nueva… o ya se la comió el alquiler.',
    'Tu nómina más reciente. Recién salida del horno y ya con medio sueldo comprometido.',
    'La última en sumarse a tu pila. Disfrútala antes de que pasen los recibos.',
    'Recién cobrada: hoy todavía puedes fingir que sobra mes.',
    'Tu moneda más fresca. Un pasito más hacia la jubilación.',
    'La última del montón. Y ya empieza la cuenta atrás para la siguiente.',
  ],
  nominaPasada: [
    'Cobrada y gastada. En ese orden y bastante seguido.',
    'Ya no está. Ni en la cuenta ni en tu memoria.',
    'Se fue entera en algo que ahora mismo no recuerdas.',
    'Directa a la hipoteca, al alquiler o a ambos.',
    'Pasó por tu cuenta corriente como un tren de alta velocidad.',
    'Mitad recibos, mitad supermercado y un café caro para celebrar.',
    'Aquella nómina cumplió su misión con honor y desapareció el día 5.',
    'Un mes entero de madrugones convertido en esta moneda.',
    'A saber en qué se fue, pero cotizada está.',
    'Entró, saludó al saldo y salió por la puerta de las domiciliaciones.',
    'Esa moneda representa cuatro lunes superados. Tiene mérito.',
    'Ya ni recuerdas cuánto te retuvieron ese mes, y mejor no mirarlo.',
    'Se fue entre facturas, alguna cena buena y el clásico «ya que estamos».',
    'Un mes menos para la pensión y una moneda más en tu montón.',
    'Llegó tarde o justo a tiempo, pero llegó.',
    'La miraste con ilusión el día 1 y con resignación el día 18.',
    'Sobreviviste a aquel mes y encima sumaste cotización.',
    'Otra nómina que pasó a mejor vida financiera.',
    'Si cada moneda hablara, esta pediría unas vacaciones.',
    'Bien ganada, rápido gastada.',
  ],
  anio: [
    'Doce meses, dos evaluaciones de desempeño y un cambio de organigrama.',
    'Un año más de «este año sí que me apunto al gimnasio».',
    'Habrá una reorganización. Te cambiarán de mesa, no de sueldo.',
    'Una cena de Navidad, un agosto y la misma impresora atascada.',
    'Alguien anunciará la transformación digital. Otra vez.',
    'Nuevo año, nuevo plan estratégico, mismo Excel de seguimiento.',
    'Trescientos sesenta y cinco días, unos cincuenta lunes y un par de puentes gloriosos.',
    'Un anillo más en el tronco: habrá semanas eternas y meses que pasen en un suspiro.',
    'Un año completo de cafés, correos y «a ver si nos vemos un día de estos».',
    'Doce nóminas (o catorce), una declaración de la Renta y unas vacaciones que sabrán a poco.',
    'Seguro que este año aprendes una herramienta nueva que jubilarán al año siguiente.',
    'Un año entero cotizando para que el anillo de la jubilación esté más cerca.',
    'Cincuenta y dos semanas: algunas para olvidar y unas cuantas muy buenas.',
    'El clásico año en el que «ahora viene lo fuerte» desde febrero hasta noviembre.',
    'Tendrá su cuesta de enero, su calor de agosto y su prisa de diciembre.',
  ],
  anioActual: [
    'Este año. Aún estás a tiempo de cumplir algún propósito. Uno.',
    'El año en curso. Cae entero en Nochevieja, con las uvas.',
    'El anillo que estás dibujando ahora mismo, día a día.',
    'Este año todavía tiene hueco para algún puente bien aprovechado.',
    'Aquí estás ahora: medio año que ya vuela y otro tanto por delante.',
    'El anillo brillante del tronco: el único que todavía puedes mejorar.',
  ],
  anioPrimero: [
    'Tu primer año. Todo era nuevo, hasta la máquina de café.',
    'El centro del tronco: donde arrancó toda tu vida laboral.',
  ],
  anioUltimo: [
    'Tu último año. Lo pasarás contando los días. Literalmente: tienes una web para eso.',
    'El último anillo del árbol. A partir de aquí, todo tiempo libre.',
  ],
  anioBisiesto: [
    'Año bisiesto: 366 días. Un día extra de trabajo por el mismo precio.',
    'Anillo bisiesto: un poco más ancho que los demás por culpa del 29 de febrero.',
    'Año de 366 días: un regalo envenenado del calendario para tu agenda.',
    'Año bisiesto. Cuatro años esperando para tener un día más que imputar.',
  ],
  anioPasado: [
    'Pasó volando. Como todos, pero ese más.',
    'Un año menos. No lo echarás de menos, salvo las vacaciones.',
    'Se fue entero en reuniones de seguimiento.',
    'Un anillo cerrado y bien curtido en el tronco.',
    'Sobreviviste a sus cincuenta lunes y aquí sigues.',
    'Un año entero cotizado a la saca. Eso ya no te lo quita nadie.',
    'Hubo semanas que parecieron siglos, y visto desde aquí fue un parpadeo.',
    'Cerrado con doce hojas de calendario y varios cafés de más.',
    'De ese año te quedas con los puentes, las risas y las vacaciones.',
    'Otro anillo completo: más experiencia, alguna cana y menos distancia hasta la meta.',
    'Ya es madera sólida en tu historial laboral.',
    'Pasó entre proyectos urgentes que hoy ya nadie recuerda.',
    'Un año más en la vida laboral: ni tan mal cuando se mira por el retrovisor.',
    'Superado con nota, cafés y algún que otro suspiro.',
  ],
  segundo: [
    'Un segundo. Lo que tarda Teams en decir que alguien está escribiendo.',
    'Tiempo suficiente para fingir que lees el correo.',
    'Un segundo de trabajo. Bueno, de estar conectado.',
    'En este segundo alguien, en algún sitio, está diciendo «¿me oís?».',
    'Lo que dura la paciencia en una daily que ya va por el minuto 40.',
    'Un segundo imputable. Ánimo con el parte de horas.',
    'Lo que tardas en cambiar de pestaña cuando pasa alguien por detrás.',
    'Un segundo menos de jornada. Poco a poco se hace el día.',
    'Tiempo exacto que dura el silencio incómodo tras «¿alguna pregunta?».',
    'En este segundo alguien está buscando el botón de quitar el silencio.',
    'Un latido de reloj de oficina. Tic, tac, hacia la salida.',
    'Lo que tarda un correo «urgente» en llegar justo cuando ibas al baño.',
    'Un segundo de concentración interrumpido por una notificación.',
    'Ni un parpadeo, pero cotiza como los demás.',
    'Tiempo suficiente para dar un sorbo al café ya templado.',
    'Un segundo más cerca de cerrar el portátil.',
  ],
  segundoPrimeraHora: [
    'Primera hora: café, correo y la mirada perdida.',
    'Aún no has abierto ningún Excel. Disfrútalo.',
    'Arrancando motores. El cerebro todavía está en modo «iniciando Windows».',
    'Primera hora: fingiendo que tienes todo bajo control mientras se calienta el café.',
    'A esta hora cualquier problema parece demasiado temprano.',
    'Buenos días de cortesía y primera ronda de correos sin abrir.',
    'Hora de revisar la agenda y suspirar un poco.',
  ],
  segundoAntesComer: [
    '¿Qué comemos hoy? La única reunión productiva del día.',
    'Cuenta atrás para el táper.',
    'Tu estómago ya ha votado por cerrar sesión.',
    'Últimos minutos antes de comer: productividad en caída libre.',
    'Alguien ya está haciendo cola delante del microondas.',
    'Imposible concentrarse cuando ya huele a comida por el pasillo.',
    'No empieces nada complejo ahora que en nada toca comer.',
  ],
  segundoDespuesComer: [
    'Digestión en curso. Los párpados pesan más que el proyecto.',
    'La hora más larga del día. Científicamente.',
    'Modo siesta activado en segundo plano.',
    'Pides un café doble o te echas una cabezada con los ojos abiertos.',
    'La pantalla brilla demasiado y la silla resulta sospechosamente cómoda.',
    'Sobremesa laboral: miras el documento pero el documento te mira a ti.',
    'Si sobrevives a esta hora, ya tienes la tarde hecha.',
  ],
  segundoViernes: [
    'Viernes por la tarde: los segundos más lentos de la semana.',
    'Viernes de tarde: cada segundo dura aproximadamente tres segundos normales.',
    '¿Quién tuvo la brillante idea de trabajar los viernes por la tarde?',
    'Cuerpo en la silla, alma ya en el fin de semana.',
    'Viernes por la tarde: no toques nada importante y sonríe.',
    'En tu cabeza ya suena la música del finde, pero el reloj va despacio.',
  ],
  segundoUltimaHora: [
    'Última hora: alguien convocará una reunión «rápida».',
    'Ya tienes la chaqueta medio puesta. Mentalmente.',
    'Recta final de la jornada: mirando la hora cada noventa segundos.',
    'Última hora: todo lo que entre ahora se responde con «lo miro mañana a primera hora».',
    'Ya se huele el cierre de sesión.',
    'Empiezas a cerrar pestañas como quien recoge la mesa.',
    'Queda menos de una hora. Aguanta sin abrir ningún marrón nuevo.',
  ],
  segundoUltimoMinuto: [
    'Último minuto. No abras ningún correo nuevo.',
    'Sesenta segundos o menos. Manos lejos del teclado.',
    '¡Último minuto! Si alguien te escribe ahora, finge que ya saliste.',
    'Cuenta atrás final de la jornada. Casi libre.',
    'Últimos segundos: guarda todo y prepara la fuga.',
  ],
  segundoPasado: [
    'Ese segundo ya es historia. Como el café de esta mañana.',
    'Pasó y ni lo notaste, que es lo mejor que le puede pasar a un segundo de trabajo.',
    'Uno menos. Quedan muchos, pero uno menos.',
    'Ya cayó al fondo del reloj. No vuelve.',
    'Un segundo trabajado y liquidado.',
    'Se fue mientras mirabas la pantalla pensando en otra cosa.',
    'Cotizado. Otro granito más abajo.',
    'Ese segundo ya no te lo quita ni una reunión imprevista.',
    'Pasó volando (bueno, a velocidad normal, pero ya pasó).',
    'Tachado de la jornada de hoy.',
    'Un segundo menos hasta salir por la puerta.',
    'Ese ya está hecho. Seguimos sumando.',
  ],
};

// ---------------------------------------------------------------- combinadores deterministas (nóminas y segundos)

const NOMINA_PAST_OPENERS = [
  'Entró en tu cuenta el último día del mes',
  'Prometiste ahorrar un buen trozo de esta nómina',
  'Hacienda cobró su parte antes que tú',
  'Pasó por tu banco casi de puntillas',
  'Aguantó intacta exactamente dos días',
  'Resumió un mes entero de madrugones',
  'Llegó puntual como un reloj',
  'Te hizo sonreír al abrir la app del banco',
  'Brilló un momento en tu saldo',
  'Cerró un mes que parecía interminable',
] as const;

const NOMINA_PAST_ENDINGS = [
  'y al lunes siguiente ya solo quedaba el recuerdo.',
  'pero la luz, el súper y el alquiler opinaron distinto.',
  'y se evaporó antes de que se enfriara el café.',
  'aunque al menos suma para la pensión.',
  'sin dejar rastro ni ticket de compra.',
  'y ya forma parte de tu tesoro cotizado.',
  'entre facturas y un capricho muy merecido.',
  'como todas las buenas monedas que ya pasaron.',
] as const;

const NOMINA_FUTURE_OPENERS = [
  'Esta nómina llegará tras otro mes de lunes',
  'Entrará limpia en tu cuenta corriente',
  'Vendrá en un PDF lleno de conceptos misteriosos',
  'Te hará sentir millonario durante dos tardes',
  'Llegará justo cuando el saldo pida socorro',
  'Traerá su retención correspondiente',
  'Caerá a final de mes con puntualidad bancaria',
  'Se sumará a tu montón dorado',
] as const;

const NOMINA_FUTURE_ENDINGS = [
  'y saldrá corriendo detrás de los recibos.',
  'antes de que el supermercado reclame su parte.',
  'pero te acercará otro mes a la jubilación.',
  'y la mirarás dos veces para comprobar que está bien.',
  'con cero reuniones extra incluidas, ojalá.',
  'lista para evaporarse con dignidad.',
  'mientras el IRPF saluda desde la primera línea.',
  'y merecerá al menos un café bueno para celebrarlo.',
] as const;

const SEC_OPENERS = [
  'En este segundo alguien',
  'Justo ahora un compañero',
  'Mientras miras este grano alguien',
  'En algún lugar de la oficina alguien',
  'En este preciso instante alguien',
  'Durante este segundo alguien',
  'Mientras cae este grano alguien',
  'Justo en este segundo alguien',
] as const;

const SEC_ENDINGS = [
  'está escribiendo «¿tienes un minutín?».',
  'acaba de responder «ok» a un correo de cuatro páginas.',
  'busca el enlace de una reunión que empezó hace cinco minutos.',
  'está recalentando un café por segunda vez.',
  'finge tomar notas mientras mira el reloj.',
  'se pregunta si hoy merece la pena pedir comida.',
  'descubre que llevaba el micrófono silenciado.',
  'mira por la ventana soñando con un puente de cuatro días.',
] as const;

/** Grupo de frases de un grano que no es un día natural. `target`: primer grano sin caer. */
export function classifyGrain(set: GrainSet, id: number, target: number, today: number): UnitPhraseGroup {
  const day = set.days[id];
  if (set.unit === 'nominas') {
    if (id === set.total - 1) return 'nominaUltima';
    if (id === 0) return 'nominaPrimera';
    if (id < target) {
      if (set.extra?.[id]) return 'nominaExtraPasada';
      if (id === target - 1) return 'nominaUltimaCobrada';
      return 'nominaPasada';
    }
    return set.extra?.[id] ? 'nominaExtra' : 'nomina';
  }
  if (set.unit === 'anios') {
    if (id === set.total - 1) return 'anioUltimo';
    if (id === 0) return 'anioPrimero';
    const year = civilFromDay(day).year;
    const now = civilFromDay(today).year;
    if (year === now) return 'anioActual';
    if (isLeapYear(year)) return 'anioBisiesto';
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

const ROUND_PAYCHECKS = new Set([10, 25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700]);

/** Frases dinámicas y combinatorias para nóminas, años y segundos. */
function dynamicUnitPhrase(
  set: GrainSet,
  id: number,
  group: UnitPhraseGroup,
  ctx: PhraseContext & { target: number },
): string | null {
  const day = set.days[id];
  const { year, month } = civilFromDay(day);
  const age = ageOnDay(day, ctx.birthDay);
  const h = hash32(id * 67 + day * 13 + group.length);

  if (set.unit === 'nominas') {
    if (group === 'nominaPrimera' || group === 'nominaUltima') return null;
    const num = id + 1;
    const past = id < ctx.target;
    const isExtra = !!set.extra?.[id];

    // Nómina redonda (#10, #25, #50, #100, #250…).
    if (ROUND_PAYCHECKS.has(num)) {
      if (past) {
        return num >= 100
          ? `Nómina nº ${num}. Si las hubieras guardado todas intactas… mejor no echar la cuenta.`
          : `Nómina nº ${num}. Un buen número redondo en tu colección de monedas.`;
      }
      return `Nómina nº ${num} (${MONTH_NAMES[month]} de ${year}). Tendrás ${age} años y un buen montón acumulado.`;
    }

    // Paga extra contextual por junio (verano) vs diciembre (Navidad).
    if (isExtra && h % 2 === 0) {
      if (month === 6) {
        return past
          ? `Paga extra de junio de ${year}: voló directa hacia el verano, las vacaciones o el aire acondicionado.`
          : `Paga extra de junio de ${year}. Ya huele a vacaciones, maleta y chiringuito.`;
      }
      if (month === 12) {
        return past
          ? `Paga extra de diciembre de ${year}: entre regalos, cenas y turrón, duró un suspiro.`
          : `Paga extra de diciembre de ${year}. Regalos, cenas y Hacienda haciendo cola.`;
      }
    }

    // Meses con personalidad propia (~30 % de probabilidad para no saturar).
    if (!isExtra && group !== 'nominaUltimaCobrada' && h % 3 === 0) {
      if (month === 1) {
        return past
          ? `Nómina de enero de ${year}: llegó como un rescate en mitad de la cuesta de enero.`
          : `Nómina de enero de ${year}. Por fin se acaba el mes más largo del año.`;
      }
      if (month === 4 || month === 5) {
        return past
          ? `Nómina de ${MONTH_NAMES[month]} de ${year}: época de campaña de la Renta, mejor no tentar a Hacienda.`
          : `Nómina de ${MONTH_NAMES[month]} de ${year}: coincide con la Renta, cruza los dedos para que salga a devolver.`;
      }
      if (month === 7 || month === 8) {
        return past
          ? `Nómina de ${MONTH_NAMES[month]} de ${year}: se fue en vacaciones, helados o sobrevivir al calor.`
          : `Nómina de ${MONTH_NAMES[month]} de ${year}: patrocinadora oficial de tus vacaciones de verano.`;
      }
      if (month === 9) {
        return past
          ? `Nómina de septiembre de ${year}: la que te reconcilió (un poco) con la vuelta a la rutina.`
          : `Nómina de septiembre de ${year}: el único motivo decente para que acabe el verano.`;
      }
      if (month === 12) {
        return past
          ? `Nómina de diciembre de ${year}: aguantó lo que pudo entre cenas y regalos.`
          : `Nómina de diciembre de ${year}: un mes de compras y celebraciones en el horizonte.`;
      }
    }

    // Combinador determinista (~30 %) en nóminas pasadas y futuras.
    if (group === 'nominaPasada' && h % 4 === 1) {
      const a = NOMINA_PAST_OPENERS[(h >>> 4) % NOMINA_PAST_OPENERS.length];
      const b = NOMINA_PAST_ENDINGS[(h >>> 9) % NOMINA_PAST_ENDINGS.length];
      return `${a} ${b}`;
    }
    if (group === 'nomina' && h % 4 === 1) {
      const a = NOMINA_FUTURE_OPENERS[(h >>> 4) % NOMINA_FUTURE_OPENERS.length];
      const b = NOMINA_FUTURE_ENDINGS[(h >>> 9) % NOMINA_FUTURE_ENDINGS.length];
      return `${a} ${b}`;
    }
    return null;
  }

  if (set.unit === 'anios') {
    if (group === 'anioPrimero' || group === 'anioUltimo' || group === 'anioActual') return null;
    const past = year < civilFromDay(ctx.today).year;
    const mid = Math.floor(set.total / 2);

    if (id === mid && set.total >= 6) {
      return past
        ? `Año ${year}: el ecuador de tu vida laboral. A partir de aquí ya pasaste la mitad.`
        : `Año ${year}: el ecuador de tu vida laboral. Desde aquí todo es cuesta abajo (en teoría).`;
    }

    // Edad redonda (cumples 30, 40, 50, 60…).
    const yearAge = year - civilFromDay(ctx.birthDay).year;
    if (yearAge >= 20 && yearAge % 10 === 0) {
      return past
        ? `${year}, el año en que cumpliste ${yearAge}. Un anillo bien marcado en el tronco.`
        : `${year}, el año de tus ${yearAge} años. Cambio de dígito y un anillo más cerca de la meta.`;
    }

    // Cambio de década del calendario (2030, 2040, 2050, 2060…).
    if (year % 10 === 0) {
      return past
        ? `Año ${year}: estrenaste década nueva con los mismos lunes de siempre.`
        : `Año ${year}: nueva década con ${yearAge} años. Habrá coches autónomos y el mismo Excel de seguimiento.`;
    }

    // Personalización con edad/año en ~30 % de los anillos.
    if (group !== 'anioBisiesto' && h % 3 === 0) {
      if (past) {
        const opts = [
          `En ${year} cumpliste ${yearAge} años y superaste doce meses enteros de reuniones.`,
          `Anillo de ${year}: con ${yearAge} años, un bloque sólido más en tu vida laboral.`,
          `${year}: sobreviviste a un año entero con ${yearAge} años y ya es historia cotizada.`,
        ];
        return opts[(h >>> 4) % opts.length];
      }
      const opts = [
        `En ${year} cumplirás ${yearAge} años. Seguramente alguien seguirá diciendo «lo vemos en una llamada rápida».`,
        `Año ${year} (${yearAge} años): doce meses más de experiencia y un anillo menos hasta el retiro.`,
        `Para ${year} tendrás ${yearAge} años: ojalá las semanas laborales ya sean más cortas para entonces.`,
      ];
      return opts[(h >>> 4) % opts.length];
    }
    return null;
  }

  // Segundos de la jornada: horas bonitas / capicúa / en punto + combinador.
  if (set.unit === 'segundos' && set.window) {
    const sec = workedSecondOfDay(set.window.jornada, id);
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    const clock = formatClock(sec);

    if (clock === '12:34:56') {
      return 'Las 12:34:56. El segundo más ordenado del día. Ojalá tu agenda estuviera igual.';
    }
    if (hh === mm && mm === ss) {
      return `Las ${clock}. Hora capicúa total: pide un deseo (por ejemplo, que se cancele la próxima reunión).`;
    }
    if (mm === 0 && ss === 0) {
      return id < ctx.target
        ? `Las ${clock} en punto. Esa hora en punto ya pasó y ni te diste cuenta.`
        : `Las ${clock} en punto. Miras el reloj y parece que solo han pasado dos minutos desde antes.`;
    }
    if ((group === 'segundo' || group === 'segundoPasado') && h % 3 === 0) {
      const a = SEC_OPENERS[(h >>> 4) % SEC_OPENERS.length];
      const b = SEC_ENDINGS[(h >>> 9) % SEC_ENDINGS.length];
      return `${a} ${b}`;
    }
  }

  return null;
}

/** Frase de cualquier grano, en cualquier unidad. El mismo grano dice siempre lo mismo. */
export function grainPhrase(set: GrainSet, id: number, ctx: PhraseContext & { target: number }): string {
  if (set.unit === 'dias') return phraseFor(set.days[id], ctx);
  const group = classifyGrain(set, id, ctx.target, ctx.today);
  const dyn = dynamicUnitPhrase(set, id, group, ctx);
  if (dyn) return dyn;
  const list = UNIT_PHRASES[group];
  return list[hash32(id * 31 + set.days[id] + group.length) % list.length];
}
