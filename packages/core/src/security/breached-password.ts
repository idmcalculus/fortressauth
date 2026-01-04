import { createHash } from 'node:crypto';

export interface BreachedPasswordCheckConfig {
  enabled: boolean;
  apiUrl: string;
  timeoutMs: number;
}

type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type Fetcher = (
  url: string,
  init?: {
    headers?: Record<string, string>;
    signal?: unknown;
  },
) => Promise<FetchResponse>;

function getFetch(): Fetcher | undefined {
  return (globalThis as { fetch?: Fetcher }).fetch;
}

function buildRangeUrl(apiUrl: string, prefix: string): string {
  const trimmed = apiUrl.replace(/\/$/, '');
  return `${trimmed}/range/${prefix}`;
}

export async function isBreachedPassword(
  password: string,
  config: BreachedPasswordCheckConfig,
): Promise<boolean> {
  if (!config.enabled) {
    return false;
  }

  const fetcher = getFetch();
  if (!fetcher) {
    return false;
  }

  const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId =
    controller && config.timeoutMs > 0
      ? setTimeout(() => controller.abort(), config.timeoutMs)
      : undefined;

  try {
    const res = await fetcher(buildRangeUrl(config.apiUrl, prefix), {
      headers: { 'Add-Padding': 'true' },
      signal: controller?.signal,
    });

    if (!res.ok) {
      return false;
    }

    const body = await res.text();
    const lines = body.split(/\r?\n/);
    for (const line of lines) {
      const [hashSuffix] = line.split(':');
      if (hashSuffix && hashSuffix.toUpperCase() === suffix) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
