export const MISSING_AUTH_API_URL_ERROR =
  'AUTH_API_URL must be set to an absolute http(s) URL before starting landing.';

function normalizeAbsoluteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    return '';
  }

  return '';
}

function normalizeDocsUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('/')) {
    return trimmed === '/' ? '/' : trimmed.replace(/\/$/, '');
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed.replace(/\/$/, '');
    }
  } catch {
    return '';
  }

  return '';
}

export function getAuthApiOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  return normalizeAbsoluteUrl(env.AUTH_API_URL ?? '');
}

export function requireAuthApiOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configuredOrigin = getAuthApiOrigin(env);
  if (!configuredOrigin) {
    throw new Error(MISSING_AUTH_API_URL_ERROR);
  }

  return configuredOrigin;
}

export function getPublicApiOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  return normalizeAbsoluteUrl(env.NEXT_PUBLIC_AUTH_API_URL ?? env.AUTH_API_URL ?? '');
}

export function getDocumentationUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const configuredDocsUrl = normalizeDocsUrl(env.NEXT_PUBLIC_DOCS_URL ?? '');
  if (configuredDocsUrl) {
    return configuredDocsUrl;
  }

  const apiOrigin = getPublicApiOrigin(env);
  return apiOrigin ? `${apiOrigin}/docs` : null;
}

export async function isApiHealthy(fetchImpl: typeof fetch, apiOrigin: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    const response = await fetchImpl(`${apiOrigin}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { status?: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}
