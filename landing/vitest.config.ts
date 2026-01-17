import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const cssMockPlugin = {
  name: 'css-mock',
  transform(_code: string, id: string) {
    if (id.endsWith('.css') || id.endsWith('.module.css')) {
      return {
        code: 'export default new Proxy({}, { get: (target, prop) => prop });',
        map: null,
      };
    }
    return undefined;
  },
};

export default defineConfig({
  plugins: [react({}), cssMockPlugin],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/__tests__/**',
        'src/app/[locale]/layout.tsx',
        'src/app/layout.tsx',
        'src/app/api/**',
        'src/middleware.ts',
        'src/proxy.ts',
        'src/app/page.tsx',
        'src/i18n/**',
        'src/components/InteractiveBackground.tsx',
        'src/components/Features.tsx',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
