import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The first test in a file registers resources through the Pulumi mocks,
    // which loads the provider SDK lazily. That takes about 3 seconds on a
    // GitHub runner and has gone past vitest's 5-second default on a slow
    // one, so allow more.
    testTimeout: 20_000,
    // Pulumi resource construction registers resources with a singleton
    // monitor; running tests in parallel inside the same process would let
    // resources from one test leak into another. Forcing a single fork keeps
    // the runtime state isolated to one process while still using fork
    // isolation between vitest workers.
    pool: 'forks',
    forks: {
      singleFork: true,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**', 'src/index.ts'],
    },
  },
});
