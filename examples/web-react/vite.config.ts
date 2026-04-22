import react from '@vitejs/plugin-react';
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
    plugins: [react()],
    base: normalizeBasePath(env.DEMO_BASE_PATH, '/react-demo/'),
    server: {
      port: 3001,
      strictPort: true,
    },
    preview: {
      port: 3001,
      strictPort: true,
    },
  };
});
