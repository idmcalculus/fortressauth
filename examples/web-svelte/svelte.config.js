import adapter from '@sveltejs/adapter-static';
import { loadEnv } from 'vite';

function normalizeBasePath(value, fallback) {
  const trimmed = (value ?? fallback).trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    paths: {
      base: normalizeBasePath(env.DEMO_BASE_PATH, '/svelte-demo'),
    },
    prerender: {
      entries: ['*'],
    },
  },
};

export default config;
