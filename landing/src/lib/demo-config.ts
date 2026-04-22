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

function resolveDemoUrl(
  configuredUrl: string | undefined,
  developmentFallback: string,
  nodeEnv: string | undefined,
): string | null {
  if (configuredUrl) {
    const normalized = normalizeDemoUrl(configuredUrl);
    if (normalized) {
      return normalized;
    }
  }

  return nodeEnv === 'production' ? null : developmentFallback;
}

export function getExamplesDemoUrls(env: NodeJS.ProcessEnv = process.env) {
  return {
    react: resolveDemoUrl(env.NEXT_PUBLIC_REACT_DEMO_URL, '/react-demo', env.NODE_ENV),
    vue: resolveDemoUrl(env.NEXT_PUBLIC_VUE_DEMO_URL, '/vue-demo', env.NODE_ENV),
    svelte: resolveDemoUrl(env.NEXT_PUBLIC_SVELTE_DEMO_URL, '/svelte-demo', env.NODE_ENV),
    angular: resolveDemoUrl(env.NEXT_PUBLIC_ANGULAR_DEMO_URL, '/angular-demo', env.NODE_ENV),
  };
}
