import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

// Los tests de fechas se ejecutan en Europe/Madrid para cubrir los cambios de horario de verano.
process.env.TZ = 'Europe/Madrid';

export const SITE_URL = 'https://relojdejubilacion.com';

// Datos del titular para el aviso legal y la política de privacidad.
const TITULAR = {
  nombre: 'Luken Escobero',
  correo: 'hola@relojdejubilacion.com',
};

// Páginas de texto. El orden es el del menú del pie.
const PAGINAS = [
  { ruta: 'jubilacion-en-espana', menu: 'Edad de jubilación' },
  { ruta: 'dias-laborables', menu: 'Días laborables y festivos' },
  { ruta: 'preguntas-frecuentes', menu: 'Preguntas frecuentes' },
  { ruta: 'acerca', menu: 'Acerca de' },
  { ruta: 'privacidad', menu: 'Privacidad y cookies' },
  { ruta: 'aviso-legal', menu: 'Aviso legal' },
];

/** Inserta la cabecera, el pie y la URL canónica comunes en las páginas de texto. */
function paginasDeTexto(): Plugin {
  return {
    name: 'paginas-de-texto',
    transformIndexHtml(html, ctx) {
      const actual = ctx.path.replace(/^\/|\/?index\.html$/g, '');
      const enlaces = PAGINAS.map(
        (p) =>
          `<a href="/${p.ruta}/"${p.ruta === actual ? ' aria-current="page"' : ''}>${p.menu}</a>`,
      ).join('\n        ');
      return html
        .replace(
          '<!--cabecera-->',
          `<header class="cabecera">
      <a class="marca" href="/">Reloj de jubilación</a>
      <a class="volver" href="/">⏳ Ver mi reloj</a>
    </header>`,
        )
        .replace(
          '<!--pie-->',
          `<footer class="pie">
      <nav aria-label="Páginas">
        ${enlaces}
      </nav>
      <p>Reloj de jubilación · Información orientativa, no es asesoramiento.</p>
    </footer>`,
        )
        .replace('<!--canonica-->', `<link rel="canonical" href="${SITE_URL}/${actual ? actual + '/' : ''}" />`)
        .replaceAll('%TITULAR_NOMBRE%', TITULAR.nombre)
        .replaceAll('%TITULAR_CORREO%', TITULAR.correo)
        .replaceAll('%MENU_PAGINAS%', enlaces);
    },
  };
}

export default defineConfig({
  server: { port: 5173, open: false },
  plugins: [paginasDeTexto()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ...Object.fromEntries(
          PAGINAS.map((p) => [p.ruta, resolve(import.meta.dirname, p.ruta, 'index.html')]),
        ),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
