import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, DesktopAuthClient } from '../client.js';

const user = {
  id: '019f5aa8-ed92-70a1-b9e7-4a89b1104171',
  email: 'test@example.com',
  emailVerified: true,
  createdAt: new Date().toISOString(),
};
const expiresAt = new Date(Date.now() + 60_000).toISOString();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientWith(fetcher: typeof fetch, storage = createMemoryStorage()) {
  return {
    storage,
    client: new DesktopAuthClient({
      baseUrl: 'https://auth.example.com',
      clientId: 'wraith',
      storageNamespace: 'test',
      redirectUri: 'wraith://auth/callback',
      storage,
      openExternal: vi.fn(),
      fetch: fetcher,
      requestTimeoutMs: 100,
    }),
  };
}

describe('DesktopAuthClient', () => {
  it('isolates pending authorization and sessions for multiple clients sharing storage', async () => {
    const storage = createMemoryStorage();
    const fetcher = vi.fn().mockImplementation(async () =>
      jsonResponse({
        success: true,
        data: { token: 'selector:verifier', tokenType: 'Bearer', expiresAt, user },
      }),
    );
    const makeClient = (clientId: string) =>
      new DesktopAuthClient({
        baseUrl: 'https://auth.example.com',
        clientId,
        redirectUri: 'wraith://auth/callback',
        storage,
        openExternal: vi.fn(),
        fetch: fetcher as unknown as typeof fetch,
      });
    const first = makeClient('first-client');
    const second = makeClient('second-client');
    const firstRequest = await first.createAuthorizationRequest('google');
    const secondRequest = await second.createAuthorizationRequest('google');

    await expect(
      first.handleAuthorizationCallback(
        `wraith://auth/callback?code=first-code&state=${firstRequest.state}`,
      ),
    ).resolves.toMatchObject({ success: true });
    await expect(
      second.handleAuthorizationCallback(
        `wraith://auth/callback?code=second-code&state=${secondRequest.state}`,
      ),
    ).resolves.toMatchObject({ success: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('normalizes trailing slashes while preserving a configured server path prefix', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { token: 'selector:verifier', tokenType: 'Bearer', expiresAt, user },
      }),
    );
    const client = new DesktopAuthClient({
      baseUrl: 'https://auth.example.com/platform/',
      clientId: 'wraith',
      storageNamespace: 'path-test',
      redirectUri: 'wraith://auth/callback',
      storage: createMemoryStorage(),
      openExternal: vi.fn(),
      fetch: fetcher as unknown as typeof fetch,
    });
    const request = await client.createAuthorizationRequest('google');
    expect(new URL(request.authorizationUrl).pathname).toBe(
      '/platform/auth/native/authorize/google',
    );

    await client.handleAuthorizationCallback(
      `wraith://auth/callback?code=one-time-code&state=${request.state}`,
    );
    expect(fetcher).toHaveBeenCalledWith(
      'https://auth.example.com/platform/auth/native/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('creates S256 authorization requests without a session token', async () => {
    const opened = vi.fn().mockResolvedValue(undefined);
    const client = new DesktopAuthClient({
      baseUrl: 'https://auth.example.com',
      clientId: 'wraith',
      storageNamespace: 'test',
      redirectUri: 'wraith://auth/callback',
      storage: createMemoryStorage(),
      openExternal: opened,
    });
    const request = await client.signIn('google');
    const url = new URL(request.authorizationUrl);
    expect(url.pathname).toBe('/auth/native/authorize/google');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toHaveLength(64);
    expect(request.authorizationUrl).not.toContain('token');
    expect(opened).toHaveBeenCalledWith(request.authorizationUrl);
  });

  it('validates state and exchanges the callback before storing the bearer token', async () => {
    const storage = createMemoryStorage();
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { token: 'selector:verifier', tokenType: 'Bearer', expiresAt, user },
      }),
    );
    const client = new DesktopAuthClient({
      baseUrl: 'https://auth.example.com',
      clientId: 'wraith',
      storageNamespace: 'test',
      redirectUri: 'wraith://auth/callback',
      storage,
      openExternal: vi.fn(),
      fetch: fetcher as unknown as typeof fetch,
    });
    const request = await client.createAuthorizationRequest('google');
    const result = await client.handleAuthorizationCallback(
      `wraith://auth/callback?code=one-time-code&state=${request.state}`,
    );
    expect(result).toEqual({ success: true, data: { user } });
    expect(fetcher).toHaveBeenCalledWith(
      'https://auth.example.com/auth/native/token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse((await storage.getItem('fortress.native.test.session')) ?? '')).toEqual({
      token: 'selector:verifier',
      expiresAt,
    });
    expect(client.getState().expiresAt).toBe(expiresAt);
  });

  it.each([
    ['missing fields', {}],
    ['missing data', undefined],
    ['null data', null],
    ['wrong field types', { token: 42, tokenType: 'Bearer', expiresAt, user }],
    ['wrong token type', { token: 'selector:verifier', tokenType: 'Basic', expiresAt, user }],
    [
      'invalid expiry',
      { token: 'selector:verifier', tokenType: 'Bearer', expiresAt: 'not-a-date', user },
    ],
    [
      'expired credentials',
      {
        token: 'selector:verifier',
        tokenType: 'Bearer',
        expiresAt: new Date(0).toISOString(),
        user,
      },
    ],
    [
      'malformed user',
      {
        token: 'selector:verifier',
        tokenType: 'Bearer',
        expiresAt,
        user: { id: 'user-1', email: 'test@example.com' },
      },
    ],
    [
      'malformed user formats',
      {
        token: 'selector:verifier',
        tokenType: 'Bearer',
        expiresAt,
        user: { ...user, id: 'not-a-uuid', email: 'not-an-email' },
      },
    ],
    [
      'non-ISO user timestamp',
      {
        token: 'selector:verifier',
        tokenType: 'Bearer',
        expiresAt,
        user: { ...user, createdAt: 'July 13, 2026' },
      },
    ],
  ])('rejects token success payloads with %s without corrupting storage', async (_label, data) => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ success: true, data }));
    const { client, storage } = clientWith(fetcher as unknown as typeof fetch);
    const existingSession = JSON.stringify({ token: 'existing:credential', expiresAt });
    await storage.setItem('fortress.native.test.session', existingSession);
    const request = await client.createAuthorizationRequest('google');
    const pending = await storage.getItem('fortress.native.test.pending');

    const result = await client.handleAuthorizationCallback(
      `wraith://auth/callback?code=one-time-code&state=${request.state}`,
    );

    expect(result).toMatchObject({ success: false, error: { code: 'PROTOCOL_ERROR' } });
    expect(await storage.getItem('fortress.native.test.session')).toBe(existingSession);
    expect(await storage.getItem('fortress.native.test.pending')).toBe(pending);
    expect(client.getState().loading).toBe(false);
  });

  it('uses the injected transport for token exchange instead of global fetch', async () => {
    const globalFetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('CORS'));
    const injectedFetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { token: 'selector:verifier', tokenType: 'Bearer', expiresAt, user },
      }),
    );
    const { client } = clientWith(injectedFetcher as unknown as typeof fetch);
    const request = await client.createAuthorizationRequest('google');

    expect(
      await client.handleAuthorizationCallback(
        `wraith://auth/callback?code=one-time-code&state=${request.state}`,
      ),
    ).toMatchObject({ success: true });
    expect(injectedFetcher).toHaveBeenCalledWith(
      'https://auth.example.com/auth/native/token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(globalFetcher).not.toHaveBeenCalled();
    globalFetcher.mockRestore();
  });

  it('rejects state mismatch without exchanging a code', async () => {
    const fetcher = vi.fn();
    const client = new DesktopAuthClient({
      baseUrl: 'https://auth.example.com',
      clientId: 'wraith',
      storageNamespace: 'test',
      redirectUri: 'wraith://auth/callback',
      storage: createMemoryStorage(),
      openExternal: vi.fn(),
      fetch: fetcher as unknown as typeof fetch,
    });
    await client.createAuthorizationRequest('google');
    const result = await client.handleAuthorizationCallback(
      'wraith://auth/callback?code=one-time-code&state=attacker-state',
    );
    expect(result.success).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('safely rejects corrupted pending state storage', async () => {
    const { client, storage } = clientWith(vi.fn() as unknown as typeof fetch);
    await storage.setItem('fortress.native.test.pending', '{broken');
    const result = await client.handleAuthorizationCallback(
      'wraith://auth/callback?code=one-time-code&state=state',
    );
    expect(result).toMatchObject({
      success: false,
      error: { code: 'AUTHORIZATION_CALLBACK_INVALID' },
    });
    expect(await storage.getItem('fortress.native.test.pending')).toBeNull();
  });

  it('validates state and surfaces provider cancellation without exchanging a code', async () => {
    const fetcher = vi.fn();
    const { client, storage } = clientWith(fetcher as unknown as typeof fetch);
    const request = await client.createAuthorizationRequest('apple');
    const result = await client.handleAuthorizationCallback(
      `wraith://auth/callback?error=OAUTH_AUTH_FAILED&error_description=Authorization%20was%20cancelled&state=${request.state}`,
    );
    expect(result).toEqual({
      success: false,
      error: { code: 'OAUTH_AUTH_FAILED', message: 'Authorization was cancelled or denied.' },
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await storage.getItem('fortress.native.test.pending')).toBeNull();
  });

  it('surfaces unsupported step-up as a typed callback error', async () => {
    const fetcher = vi.fn();
    const { client, storage } = clientWith(fetcher as unknown as typeof fetch);
    const request = await client.createAuthorizationRequest('google', { maxAgeSeconds: 300 });

    await expect(
      client.handleAuthorizationCallback(
        `wraith://auth/callback?error=STEP_UP_UNSUPPORTED&state=${request.state}`,
      ),
    ).resolves.toEqual({
      success: false,
      error: {
        code: 'STEP_UP_UNSUPPORTED',
        message: 'The selected provider cannot prove a fresh authentication ceremony.',
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await storage.getItem('fortress.native.test.pending')).toBeNull();
  });

  it('preserves pending state through offline exchange failures so the callback can retry', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { token: 'selector:verifier', tokenType: 'Bearer', expiresAt, user },
        }),
      );
    const { client, storage } = clientWith(fetcher as unknown as typeof fetch);
    const request = await client.createAuthorizationRequest('google');
    const callback = `wraith://auth/callback?code=one-time-code&state=${request.state}`;
    expect(await client.handleAuthorizationCallback(callback)).toMatchObject({
      success: false,
      error: { code: 'NETWORK_ERROR' },
    });
    expect(await storage.getItem('fortress.native.test.pending')).not.toBeNull();
    expect(await client.handleAuthorizationCallback(callback)).toMatchObject({ success: true });
    expect(await storage.getItem('fortress.native.test.pending')).toBeNull();
  });

  it('times out bounded requests and always exits loading state', async () => {
    const fetcher = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const { client, storage } = clientWith(fetcher as unknown as typeof fetch);
    await storage.setItem(
      'fortress.native.test.session',
      JSON.stringify({ token: 'selector:verifier', expiresAt }),
    );
    const result = await client.restoreSession();
    expect(result).toMatchObject({ success: false, error: { code: 'REQUEST_TIMEOUT' } });
    expect(client.getState().loading).toBe(false);
    expect(await storage.getItem('fortress.native.test.session')).not.toBeNull();
  });

  it.each([
    ['non-JSON', new Response('<html>bad gateway</html>', { status: 502 }), 'PROTOCOL_ERROR'],
    ['HTTP 500', jsonResponse({ success: false, error: 'INTERNAL_ERROR' }, 500), 'INTERNAL_ERROR'],
  ])('preserves credentials on %s restore failures', async (_label, response, code) => {
    const { client, storage } = clientWith(
      vi.fn().mockResolvedValue(response) as unknown as typeof fetch,
    );
    await storage.setItem(
      'fortress.native.test.session',
      JSON.stringify({ token: 'selector:verifier', expiresAt }),
    );
    const result = await client.restoreSession();
    expect(result).toMatchObject({ success: false, error: { code } });
    expect(client.getState().loading).toBe(false);
    expect(await storage.getItem('fortress.native.test.session')).not.toBeNull();
  });

  it.each([
    ['missing user', {}],
    ['missing data', undefined],
    ['null data', null],
    ['wrong user type', { user: 'not-an-object' }],
    ['missing user fields', { user: { id: 'user-1', email: 'test@example.com' } }],
    ['invalid user timestamp', { user: { ...user, createdAt: 'not-a-date' } }],
    ['invalid user formats', { user: { ...user, id: 'not-a-uuid', email: 'not-an-email' } }],
    ['parseable non-ISO user timestamp', { user: { ...user, createdAt: 'July 13, 2026' } }],
  ])('preserves credentials when session success data has %s', async (_label, data) => {
    const { client, storage } = clientWith(
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data })) as unknown as typeof fetch,
    );
    const stored = JSON.stringify({ token: 'selector:verifier', expiresAt });
    await storage.setItem('fortress.native.test.session', stored);

    expect(await client.restoreSession()).toMatchObject({
      success: false,
      error: { code: 'PROTOCOL_ERROR' },
    });
    expect(await storage.getItem('fortress.native.test.session')).toBe(stored);
    expect(client.getState().loading).toBe(false);
  });

  it('preserves the last valid in-memory session after a malformed restore response', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { user } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: {} }));
    const { client, storage } = clientWith(fetcher as unknown as typeof fetch);
    const stored = JSON.stringify({ token: 'selector:verifier', expiresAt });
    await storage.setItem('fortress.native.test.session', stored);

    expect(await client.restoreSession()).toEqual({ success: true, data: { user } });
    expect(await client.restoreSession()).toMatchObject({
      success: false,
      error: { code: 'PROTOCOL_ERROR' },
    });
    expect(client.getState()).toMatchObject({ user, expiresAt, loading: false });
    expect(await storage.getItem('fortress.native.test.session')).toBe(stored);
  });

  it('uses the injected transport for session restore instead of global fetch', async () => {
    const globalFetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('CORS'));
    const injectedFetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, data: { user } }));
    const { client, storage } = clientWith(injectedFetcher as unknown as typeof fetch);
    await storage.setItem(
      'fortress.native.test.session',
      JSON.stringify({ token: 'selector:verifier', expiresAt }),
    );

    expect(await client.restoreSession()).toEqual({ success: true, data: { user } });
    expect(injectedFetcher).toHaveBeenCalledWith(
      'https://auth.example.com/auth/native/session',
      expect.objectContaining({
        headers: { Authorization: 'Bearer selector:verifier' },
      }),
    );
    expect(globalFetcher).not.toHaveBeenCalled();
    globalFetcher.mockRestore();
  });

  it('clears credentials on HTTP 401 and on local expiry', async () => {
    const { client, storage } = clientWith(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: false, error: 'SESSION_INVALID' }, 401),
        ) as unknown as typeof fetch,
    );
    await storage.setItem(
      'fortress.native.test.session',
      JSON.stringify({ token: 'selector:verifier', expiresAt }),
    );
    expect(await client.restoreSession()).toMatchObject({
      success: false,
      error: { code: 'SESSION_INVALID' },
    });
    expect(await storage.getItem('fortress.native.test.session')).toBeNull();

    await storage.setItem(
      'fortress.native.test.session',
      JSON.stringify({ token: 'selector:verifier', expiresAt: new Date(0).toISOString() }),
    );
    expect(await client.restoreSession()).toMatchObject({
      success: false,
      error: { code: 'SESSION_EXPIRED' },
    });
    expect(await storage.getItem('fortress.native.test.session')).toBeNull();
  });

  it('preserves credentials when offline sign-out fails and clears them after retry', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const { client, storage } = clientWith(fetcher as unknown as typeof fetch);
    await storage.setItem(
      'fortress.native.test.session',
      JSON.stringify({ token: 'selector:verifier', expiresAt }),
    );
    expect(await client.signOut()).toMatchObject({
      success: false,
      error: { code: 'NETWORK_ERROR' },
    });
    expect(await storage.getItem('fortress.native.test.session')).not.toBeNull();
    expect(await client.signOut()).toEqual({ success: true });
    expect(await storage.getItem('fortress.native.test.session')).toBeNull();
  });

  it('uses the injected transport for logout instead of global fetch', async () => {
    const globalFetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('CORS'));
    const injectedFetcher = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    const { client, storage } = clientWith(injectedFetcher as unknown as typeof fetch);
    await storage.setItem(
      'fortress.native.test.session',
      JSON.stringify({ token: 'selector:verifier', expiresAt }),
    );

    expect(await client.signOut()).toEqual({ success: true });
    expect(injectedFetcher).toHaveBeenCalledWith(
      'https://auth.example.com/auth/native/logout',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer selector:verifier' },
      }),
    );
    expect(globalFetcher).not.toHaveBeenCalled();
    globalFetcher.mockRestore();
  });

  it('exits loading state when secure storage fails during sign-out', async () => {
    const storage = createMemoryStorage();
    storage.getItem = vi.fn().mockRejectedValue(new Error('keychain unavailable'));
    const client = new DesktopAuthClient({
      baseUrl: 'https://auth.example.com',
      clientId: 'wraith',
      storageNamespace: 'test',
      redirectUri: 'wraith://auth/callback',
      storage,
      openExternal: vi.fn(),
      fetch: vi.fn() as unknown as typeof fetch,
    });
    expect(await client.signOut()).toMatchObject({
      success: false,
      error: { code: 'STORAGE_ERROR' },
    });
    expect(client.getState().loading).toBe(false);
  });

  it('revokes an exchanged token when secure session storage fails', async () => {
    const storage = createMemoryStorage();
    const setItem = storage.setItem.bind(storage);
    storage.setItem = vi.fn(async (key, value) => {
      if (key.endsWith('.session')) throw new Error('keychain unavailable');
      await setItem(key, value);
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { token: 'selector:verifier', tokenType: 'Bearer', expiresAt, user },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const client = new DesktopAuthClient({
      baseUrl: 'https://auth.example.com',
      clientId: 'wraith',
      storageNamespace: 'test',
      redirectUri: 'wraith://auth/callback',
      storage,
      openExternal: vi.fn(),
      fetch: fetcher as unknown as typeof fetch,
    });
    const request = await client.createAuthorizationRequest('google');

    await expect(
      client.handleAuthorizationCallback(
        `wraith://auth/callback?code=one-time-code&state=${request.state}`,
      ),
    ).resolves.toMatchObject({ success: false, error: { code: 'STORAGE_ERROR' } });
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://auth.example.com/auth/native/logout',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer selector:verifier' },
      }),
    );
    expect(await storage.getItem('fortress.native.test.pending')).toBeNull();
    expect(client.getState().loading).toBe(false);
  });

  it('binds an exact audience and requested authentication age into authorization', async () => {
    const { client } = clientWith(vi.fn() as unknown as typeof fetch);
    const request = await client.createAuthorizationRequest('google', {
      audience: 'desktop-api',
      maxAgeSeconds: 300,
    });
    const url = new URL(request.authorizationUrl);

    expect(url.searchParams.get('audience')).toBe('desktop-api');
    expect(url.searchParams.get('max_age')).toBe('300');
    await expect(
      client.createAuthorizationRequest('google', { audience: 'invalid audience' }),
    ).rejects.toThrow('Invalid native resource audience');
    await expect(
      client.createAuthorizationRequest('google', { maxAgeSeconds: -1 }),
    ).rejects.toThrow('Invalid native authentication age');
    await expect(client.createAuthorizationRequest('google', { maxAgeSeconds: 0 })).rejects.toThrow(
      'Invalid native authentication age',
    );
  });
});
