import { defineConfig } from 'vitest/config';

// Engine tests are pure TypeScript (node env); no plugins needed. Loaded
// directly by Vitest and not part of the tsc build, so it stays free of the
// Vite version-nesting type conflict.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
