import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts', 'src/schema.ts'],
      thresholds: {
        lines: 85,
        functions: 80,
        branches: 65,
        statements: 85,
      },
    },
  },
});
