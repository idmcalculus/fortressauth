import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

function normalizeBasePath(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? fallback).trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [vue()],
    base: normalizeBasePath(env.DEMO_BASE_PATH, '/vue-demo/'),
    server: {
      port: 3002,
      strictPort: true,
    },
    preview: {
      port: 3002,
      strictPort: true,
    },
  };
});
