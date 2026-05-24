import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpJson } from '../http.js';

describe('httpJson', () => {
  let logger: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = { error: vi.fn() };
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns ok with parsed JSON on a successful response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ access_token: 'abc' }),
    } as Response);

    const result = await httpJson<{ access_token: string }>('https://example.com', {
      provider: 'google',
      operation: 'token',
      logger,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.access_token).toBe('abc');
    }
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns err and logs when the upstream returns a non-OK status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    } as Response);

    const result = await httpJson('https://example.com', {
      provider: 'google',
      operation: 'token',
      logger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('OAUTH_AUTH_FAILED');
    }
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0]?.[0]).toContain('non-OK status 500');
  });

  it('uses the configured errorCode when the request fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('boom'));

    const result = await httpJson('https://example.com', {
      provider: 'github',
      operation: 'userinfo',
      errorCode: 'OAUTH_USER_INFO_FAILED',
      logger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('OAUTH_USER_INFO_FAILED');
    }
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('returns err when the response content-type is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => ({}),
    } as Response);

    const result = await httpJson('https://example.com', {
      provider: 'google',
      operation: 'token',
      logger,
    });

    expect(result.success).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('unexpected content-type "text/html"'),
    );
  });

  it('tolerates fixtures without a real Headers instance', async () => {
    // Mirrors how provider tests build a mock Response.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'abc' }),
    } as Response);

    const result = await httpJson<{ access_token: string }>('https://example.com', {
      provider: 'google',
      operation: 'token',
      logger,
    });

    expect(result.success).toBe(true);
  });

  it('aborts the request after the configured timeout', async () => {
    vi.useFakeTimers();
    let abortReason: unknown;
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          abortReason = signal.reason;
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    const promise = httpJson('https://example.com', {
      provider: 'google',
      operation: 'token',
      timeoutMs: 100,
      logger,
    });

    await vi.advanceTimersByTimeAsync(101);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(abortReason).toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('aborted'),
      expect.anything(),
    );
  });

  it('honors an externally provided AbortSignal', async () => {
    const externalController = new AbortController();
    let abortObserved = false;
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          abortObserved = true;
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    const promise = httpJson('https://example.com', {
      provider: 'google',
      operation: 'token',
      signal: externalController.signal,
      logger,
    });

    externalController.abort();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(abortObserved).toBe(true);
  });
});
