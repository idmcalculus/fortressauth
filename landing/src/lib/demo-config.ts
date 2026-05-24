const DEFAULT_DEVELOPMENT_DEMO_URL = '/react-demo';
const DEFAULT_PRODUCTION_DEMO_URL = 'https://react-demo.fortressauth.com';

function normalizeDemoUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  const withoutTrailingSlash = trimmed.replace(/\/$/, '');
  if (withoutTrailingSlash.startsWith('http://') || withoutTrailingSlash.startsWith('https://')) {
    return withoutTrailingSlash;
  }

  return withoutTrailingSlash.startsWith('/') ? withoutTrailingSlash : `/${withoutTrailingSlash}`;
}

export function getLiveDemoUrl(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const normalized = env.NEXT_PUBLIC_LIVE_DEMO_URL
    ? normalizeDemoUrl(env.NEXT_PUBLIC_LIVE_DEMO_URL)
    : '';

  if (normalized) {
    return normalized;
  }

  return env.NODE_ENV === 'production' ? DEFAULT_PRODUCTION_DEMO_URL : DEFAULT_DEVELOPMENT_DEMO_URL;
}
