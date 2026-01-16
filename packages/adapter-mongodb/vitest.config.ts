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
      // Thresholds are only validated when MongoDB is available.
      // When MONGODB_URL is not set, tests are skipped and coverage is not meaningful.
      // CI should run with a MongoDB service to enforce thresholds.
      thresholds:
        process.env.MONGODB_TEST_URL || process.env.MONGODB_URL
          ? {
            lines: 90,
            functions: 90,
            branches: 80,
            statements: 90,
          }
          : {
            // No thresholds when MongoDB is unavailable (tests skipped)
            lines: 0,
            functions: 0,
            branches: 0,
            statements: 0,
          },
    },
  },
});
