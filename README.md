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

- **Clic o toque en un grano**: muestra su fecha y una frase.
- **Agitar el ratón rápido sobre el reloj** (o el móvil): la arena se remueve dentro de cada bulbo. El cuello sigue cerrado.
- **La primera vez** (o al cambiar de vida laboral en ajustes): el reloj empieza lleno arriba y todos los días ya trabajados caen en un chorro de unos 6 segundos. El último cae despacio, con su brillo.
- **Al volver tras unos días**: caen solo los granos pendientes, de la misma forma.

Con `prefers-reduced-motion` no se puede agitar y las animaciones se reducen al mínimo.

## Cómo está hecho

- `src/holidays.ts`: días laborables, Pascua y festivos.
- `src/dates.ts`: lógica pura de fechas; el grano N es el N-ésimo día laborable. Trabaja con números de día civil (`Date.UTC` sobre año/mes/día), así que ni los años bisiestos ni el horario de verano desplazan los días.
- `src/phrases.ts`: más de 70 frases agrupadas por tipo de día, elegidas de forma determinista según la fecha.
- `src/hourglass.ts`: geometría del reloj sobre una rejilla. Se dimensiona para que cada bulbo quepa todos los granos con un 12 % de holgura.
- `src/sim.ts`: arena por autómata celular. Cada celda guarda el ID del grano (ID = número de día laborable desde el inicio). Solo se procesan los granos activos, y los demás duermen. El cuello son celdas sólidas: el grano del día lo atraviesa como animación, fuera de la rejilla.
- `src/render.ts`: Canvas 2D. Se pinta la arena a un píxel por celda, se escala sin suavizado y encima va el vidrio.
- La configuración y el progreso se guardan en `localStorage`. Si no está disponible, la app funciona igual, solo que sin recordar nada.
