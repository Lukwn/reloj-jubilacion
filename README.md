# Reloj de jubilación ⏳

Un reloj de arena en el que cada grano es un día laborable de tu vida laboral. Arriba quedan los días hasta la jubilación; abajo, los que ya pasaron. Cada medianoche que cierra un día laborable cae un grano, y solo uno.

Los sábados, domingos y festivos no tienen grano. Se descuentan los festivos nacionales de España (incluido Viernes Santo) y, desde ajustes, Jueves Santo, Lunes de Pascua y los festivos autonómicos o locales que añadas (`24/06` cada año, `09/11/2027` solo ese año).

## Arrancar

```bash
npm install && npm run dev
```

Abre http://localhost:5173. La primera vez te pedirá la fecha de nacimiento, la edad de jubilación (67 por defecto) y la fecha de inicio de tu vida laboral. Puedes cambiarlas con el botón de ajustes.

- `npm test`: tests de la lógica de fechas, las frases y la simulación (Vitest, en `Europe/Madrid`).
- `npm run build`: comprobación de tipos y build de producción.
- `http://localhost:5173/?fps`: muestra los fps y los granos activos.

## Cómo se usa

- **Unidad de tiempo** (selector sobre el contador): cada grano puede ser
  - un **día laborable** (la de siempre);
  - un **segundo de trabajo**: el reloj muestra tu jornada de hoy y cae un grano cada segundo, salvo en la comida y fuera de horario. El contador cuenta los segundos de trabajo que te quedan hasta la jubilación. El horario se configura en ajustes (por defecto, de 9:00 a 18:00 con la comida de 14:00 a 15:00);
  - una **nómina**: el último día laborable de cada mes, con las pagas extra de junio y diciembre en dorado (14 pagas, o 12 si se elige en ajustes);
  - un **año**: un grano por año natural, que cae en Nochevieja.
  
  Con pocos granos (nóminas, años) se dibujan como canicas. Cada unidad tiene sus frases, su cuenta atrás, sus hitos y su imagen para compartir; en segundos las capas son por horas, y no hay reproducción ni barra de edad.
- **Clic o toque en un grano**: muestra su fecha y una frase.
- **Lupa** (con ratón): al pasar por la arena, una lupa la amplía, recuadra el grano señalado y muestra su fecha (y el resumen del año con las capas activadas). Tras un clic se aparta hasta que el ratón se aleja.
- **Con ratón, pulsar y arrastrar a un lado**: inclina el reloj entero (se dibuja girado y la gravedad de la arena lo sigue). Al soltarlo vuelve a su sitio. **Doble clic**: una vuelta completa.
- **Con el dedo, arrastrar por la arena**: la remueve. En la superficie abre un surco; dentro de la arena compacta, los granos de delante del dedo pasan detrás y se mezclan a lo largo del trazo.
- **Agitar el móvil**: la arena se remueve dentro de cada bulbo. El cuello sigue cerrado.
- **Inclinar el móvil**: la gravedad de la arena sigue la orientación del móvil (`deviceorientation`, beta y gamma). La inclinación se exagera un poco porque en la rejilla la arena no resbala hasta los 45°. Boca abajo, la arena cae al otro extremo de cada bulbo; el cuello sigue cerrado.
- **Botón de capas**: tiñe la arena por años. Al pasar el ratón (o tocar un grano) se resalta ese año y se ve cuántos días laborables tiene. Con **Ordenar capas** la arena se nivela y cada grano vuelve a su sitio por fecha, de abajo arriba: queda igual que recién empaquetada.
- **Reproducir el paso del tiempo** (botón ▶ junto al contador): el tiempo corre desde hoy o desde el principio de la vida laboral, de 1 día a 5 años por segundo, con la fecha de cada momento en un panel arriba (el reloj se encoge para dejarle sitio). Caen los granos, se celebran los hitos y se para al llegar a la jubilación. Mientras dura no se guarda nada ni corre el tiempo real; con × se vuelve a hoy.
- **Cuenta atrás**: debajo del contador, cuánto falta para que caiga el grano de hoy (o el próximo, si hoy no es laborable). Se alterna con el próximo hito.
- **Hitos**: 10 %, 25 %, el ecuador, 75 %, 90 %, 1000/2500/5000… días trabajados, los últimos 1000/500/100/10 días y la jubilación. Los tres próximos brillan en la arena; al alcanzar uno sale un aviso. Los ya celebrados se guardan para no repetirlos.
- **¿Y si me jubilo a otra edad?**: al tocar el contador se abre una barra de edad. Los granos que te ahorrarías se ven transparentes. Cambiar solo la edad no repite la caída de los días ya trabajados.
- **Compartir**: genera una imagen de 1080 × 1350 con el reloj, los días que quedan y el porcentaje (sin la fecha de nacimiento). Se comparte con el menú del sistema si el navegador lo permite, o se descarga.
- **Sonido** (apagado por defecto): siseo de arena sintetizado con Web Audio según la arena en movimiento, un «tin» al caer el grano del día y un arpegio en cada hito.
- **La primera vez** (o al cambiar de vida laboral en ajustes): el reloj empieza lleno arriba y todos los días ya trabajados caen en un chorro de unos 6 segundos. El último cae despacio, con su brillo.
- **Al volver tras unos días**: caen solo los granos pendientes, de la misma forma.

Con `prefers-reduced-motion` no se puede agitar y las animaciones se reducen al mínimo.

## Cómo está hecho

- `src/holidays.ts`: días laborables, Pascua y festivos.
- `src/dates.ts`: lógica pura de fechas; el grano N es el N-ésimo día laborable. Trabaja con números de día civil (`Date.UTC` sobre año/mes/día), así que ni los años bisiestos ni el horario de verano desplazan los días.
- `src/phrases.ts`: más de 70 frases agrupadas por tipo de día, elegidas de forma determinista según la fecha.
- `src/units.ts`: las unidades de tiempo (días, segundos de la jornada, nóminas y años): qué día o segundo es cada grano, cuándo cae, sus textos y la cuenta atrás. Lógica pura, con tests.
- `src/falling.ts`: el grano que cruza el cuello. Baja por el tubo y, al salir, cae hacia donde tire la gravedad (con el reloj inclinado, en diagonal) hasta chocar con la arena o el vidrio. Con el reloj tumbado o boca abajo, el cuello no deja pasar nada.
- `src/hourglass.ts`: geometría del reloj sobre una rejilla. Se dimensiona para que cada bulbo quepa todos los granos con un 12 % de holgura.
- `src/sim.ts`: arena por autómata celular. Cada celda guarda el ID del grano (ID = número de día laborable desde el inicio). Solo se procesan los granos activos, y los demás duermen. El cuello son celdas sólidas: el grano del día lo atraviesa como animación, fuera de la rejilla.
- `src/countdown.ts`, `src/milestones.ts`: cuenta atrás e hitos (lógica pura, con tests).
- `src/sound.ts`: sonido con Web Audio. `src/share.ts`: imagen para compartir.
- `src/render.ts`: Canvas 2D. Se pinta la arena a un píxel por celda, se escala sin suavizado y encima va el vidrio.
- Páginas de texto (guía de jubilación, días laborables, preguntas frecuentes, acerca de, privacidad y aviso legal): una carpeta por página con su `index.html`, estilos en `src/pages.css`. La cabecera, el pie, el menú y la URL canónica los inserta un plugin en `vite.config.ts`, donde también están la lista de páginas y los datos del titular. `public/` tiene `robots.txt` y `sitemap.xml`.
- La configuración y el progreso se guardan en `localStorage`. Si no está disponible, la app funciona igual, solo que sin recordar nada.
