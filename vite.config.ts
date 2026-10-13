import { defineConfig } from 'vitest/config';

// Los tests de fechas se ejecutan en Europe/Madrid para cubrir los cambios de horario de verano.
process.env.TZ = 'Europe/Madrid';

export default defineConfig({
  server: { port: 5173, open: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
