import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken, postAuthJson } from '../auth-api';

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth-api', () => {
  it('fetches a CSRF token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { csrfToken: 'csrf-token' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCsrfToken()).resolves.toBe('csrf-token');

    expect(fetchMock).toHaveBeenCalledWith('/auth/csrf', {
      credentials: 'include',
    });
  });

  it('throws when the CSRF response has no token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          success: false,
          error: 'CSRF_TOKEN_UNAVAILABLE',
        }),
      ),
    );

    await expect(fetchCsrfToken()).rejects.toThrow('CSRF_TOKEN_UNAVAILABLE');
  });

  it('posts auth JSON with the CSRF header', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { csrfToken: 'csrf-token' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { ok: true },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(postAuthJson('/auth/test', { email: 'dev@example.com' })).resolves.toEqual({
      success: true,
      data: { ok: true },
    });

    expect(fetchMock).toHaveBeenLastCalledWith('/auth/test', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': 'csrf-token',
      },
      body: JSON.stringify({ email: 'dev@example.com' }),
    });
  });

  it('returns HTTP errors for non-JSON failed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          jsonResponse({
            success: true,
            data: { csrfToken: 'csrf-token' },
          }),
        )
        .mockResolvedValueOnce(new Response('blocked', { status: 418 })),
    );

    await expect(postAuthJson('/auth/test', {})).resolves.toEqual({
      success: false,
      error: 'HTTP_418',
    });
  });

  it('returns success for non-JSON successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          jsonResponse({
            success: true,
            data: { csrfToken: 'csrf-token' },
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );

    await expect(postAuthJson('/auth/test', {})).resolves.toEqual({
      success: true,
    });
  });

  it('returns network errors from failed requests', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));

    await expect(postAuthJson('/auth/test', {})).resolves.toEqual({
      success: false,
      error: 'offline',
    });
  });
});
