import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const reactNativeMock = fileURLToPath(
  new URL('../react-native-sdk/src/__tests__/react-native-mock.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      'react-native': reactNativeMock,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/index.ts', 'src/storage.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
