import type { AuthErrorCode, Result } from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';

/**
 * Default timeout for OAuth provider HTTP requests, in milliseconds. Slow
 * upstreams (Google, GitHub, Apple) must not be allowed to hang the OAuth
 * callback indefinitely; a hung callback would also hold a row in
 * `oauth_states` and a request slot for the entire timeout window.
 */
export const DEFAULT_OAUTH_HTTP_TIMEOUT_MS = 10_000;

/**
 * Logger interface used by the OAuth HTTP helper. We accept any object with
 * a `console`-compatible `error` method so callers can plug in pino,
 * winston, or a custom shim. Defaults to the global `console`.
 */
export interface OAuthHttpLogger {
  error: (message: string, ...args: unknown[]) => void;
}

export interface OAuthHttpOptions extends Omit<RequestInit, 'signal'> {
  /** Provider tag for log breadcrumbs, e.g. 'google', 'github', 'microsoft'. */
  provider: string;
  /** Phase tag for log breadcrumbs, e.g. 'token', 'userinfo'. */
  operation: string;
  /** AuthErrorCode to return on failure. Defaults to 'OAUTH_AUTH_FAILED'. */
  errorCode?: AuthErrorCode;
  /** Per-request timeout in ms. Defaults to {@link DEFAULT_OAUTH_HTTP_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** External AbortSignal that can also abort the request. */
  signal?: AbortSignal;
  /** Logger override; defaults to `console`. */
  logger?: OAuthHttpLogger;
}

/**
 * Performs a JSON HTTP request against an OAuth provider with a timeout,
 * logs failures with provider/operation breadcrumbs, and returns a Result
 * suitable for direct return from a provider method. This consolidates the
 * try/catch + AbortSignal + JSON.parse pattern that every OAuth provider
 * needs.
 *
 * Returns:
 *  - `ok(parsed)` when the upstream returns 2xx JSON
 *  - `err(errorCode)` for any of: non-2xx response, non-JSON body, network
 *    failure, timeout, JSON parse error, or AbortSignal cancellation
 *
 * The function never throws; provider authors do not need their own
 * try/catch around the call.
 */
export async function httpJson<T = unknown>(
  url: string,
  options: OAuthHttpOptions,
): Promise<Result<T, AuthErrorCode>> {
  const {
    provider,
    operation,
    errorCode = 'OAUTH_AUTH_FAILED',
    timeoutMs = DEFAULT_OAUTH_HTTP_TIMEOUT_MS,
    logger = console,
    signal: externalSignal,
    headers,
    ...rest
  } = options;

  // Compose timeout signal with any externally provided abort signal so
  // either source can cancel the request.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    const init: RequestInit = {
      ...rest,
      signal: controller.signal,
    };
    if (headers !== undefined) {
      init.headers = headers;
    }
    const response = await fetch(url, init);

    if (!response.ok) {
      logger.error(
        `[oauth:${provider}] ${operation} returned non-OK status ${response.status} ${response.statusText}`,
      );
      return err(errorCode);
    }

    // Defensive content-type check: a number of upstreams (especially
    // captive portals or CDN error pages) return HTML 200s. Without this
    // check `response.json()` throws SyntaxError and we lose context.
    // Tolerate test fixtures that build a partial Response without a
    // `headers` Headers instance: when content-type can't be read, we
    // optimistically attempt JSON parsing and fall through to the catch
    // block below if the body is not valid JSON.
    const contentType = response.headers?.get?.('content-type') ?? null;
    if (contentType !== null && !contentType.includes('json')) {
      logger.error(
        `[oauth:${provider}] ${operation} returned unexpected content-type "${contentType}"`,
      );
      return err(errorCode);
    }

    const data = (await response.json()) as T;
    return ok(data);
  } catch (error) {
    const isAbort =
      error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    if (isAbort) {
      logger.error(
        `[oauth:${provider}] ${operation} aborted (likely timed out after ${timeoutMs}ms)`,
        error,
      );
    } else {
      logger.error(`[oauth:${provider}] ${operation} failed`, error);
    }
    return err(errorCode);
  } finally {
    clearTimeout(timeoutId);
  }
}
