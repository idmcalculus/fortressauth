import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeAuthorizationGrant, User } from '@fortressauth/core';
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const redirectUri = 'desktop-app://auth/callback';
const clientId = 'desktop-app';
const audience = 'desktop-api';
const otherAudience = 'other-api';
const resourceSecret = 'resource-secret-'.padEnd(64, 'a');
const rotatedResourceSecret = 'rotated-'.padEnd(64, 'c');
const disabledResourceSecret = 'disabled-'.padEnd(64, 'd');
const otherResourceSecret = 'other-resource-secret-'.padEnd(64, 'b');
const codeVerifier = 'A'.repeat(64);
const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
const dbPath = join(tmpdir(), `fortress-native-${randomUUID()}.sqlite`);

type App = { request: (path: string, init?: RequestInit) => Promise<Response> };

describe('production native routes', () => {
  let app: App;
  let rawCode: string;
  let userId: string;

  beforeAll(async () => {
    vi.resetModules();
    process.env.DATABASE_URL = dbPath;
    process.env.BASE_URL = 'http://localhost:3000';
    process.env.METRICS_ENABLED = 'false';
    process.env.COOKIE_SECURE = 'false';
    process.env.NATIVE_CLIENTS_JSON = JSON.stringify([
      { clientId, redirectUris: [redirectUri], resourceAudiences: [audience] },
      {
        clientId: 'other-desktop-app',
        redirectUris: ['other-app://auth/callback'],
        resourceAudiences: [otherAudience],
      },
    ]);
    process.env.RESOURCE_SERVERS_JSON = JSON.stringify([
      { audience, allowedClientIds: [clientId], rateLimit: { maxTokens: 30 } },
      { audience: otherAudience, allowedClientIds: ['other-desktop-app'] },
    ]);
    process.env.RESOURCE_SERVER_CREDENTIALS_JSON = JSON.stringify([
      {
        audience,
        credentials: [
          { credentialId: 'desktop-api-current', secret: resourceSecret },
          { credentialId: 'desktop-api-next', secret: rotatedResourceSecret },
          {
            credentialId: 'desktop-api-disabled',
            secret: disabledResourceSecret,
            enabled: false,
          },
        ],
      },
      {
        audience: otherAudience,
        credentials: [{ credentialId: 'other-api-current', secret: otherResourceSecret }],
      },
    ]);
    process.env.GOOGLE_CLIENT_ID = 'google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/oauth/google/callback';
    process.env.APPLE_CLIENT_ID = 'apple-client';
    process.env.APPLE_TEAM_ID = 'apple-team';
    process.env.APPLE_KEY_ID = 'apple-key';
    process.env.APPLE_CLIENT_SECRET = 'apple-secret';
    process.env.APPLE_REDIRECT_URI = 'http://localhost:3000/auth/oauth/apple/callback';

    ({ app } = (await import('../index.js')) as { app: App });

    const sqlite = new Database(dbPath);
    const user = User.create('native-route@example.com').withEmailVerified();
    userId = user.id;
    const createdAt = user.createdAt.toISOString();
    sqlite
      .prepare(
        'INSERT INTO users (id, email, email_verified, created_at, updated_at, locked_until) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(user.id, user.email, 1, createdAt, user.updatedAt.toISOString(), null);
    const created = NativeAuthorizationGrant.create({
      userId: user.id,
      clientId,
      redirectUri,
      codeChallenge,
      requestedAudience: audience,
      ttlMs: 60_000,
    });
    rawCode = created.rawCode;
    sqlite
      .prepare(
        'INSERT INTO native_authorization_grants (id, user_id, client_id, selector, verifier_hash, redirect_uri, code_challenge, requested_audience, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        created.grant.id,
        created.grant.userId,
        created.grant.clientId,
        created.grant.selector,
        created.grant.verifierHash,
        created.grant.redirectUri,
        created.grant.codeChallenge,
        created.grant.requestedAudience,
        created.grant.expiresAt.toISOString(),
        created.grant.createdAt.toISOString(),
      );
    sqlite.close();
  });

  it('enforces exact registered redirects and S256 on authorization', async () => {
    const valid = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state: 'S'.repeat(64),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const response = await app.request(`/auth/native/authorize/google?${valid}`);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('accounts.google.com');

    valid.set('redirect_uri', 'desktop-app://auth/callback/attacker');
    const invalid = await app.request(`/auth/native/authorize/google?${valid}`);
    expect(invalid.status).toBe(400);
  });

  it('returns unsupported step-up to the registered native callback', async () => {
    const state = 'U'.repeat(64);
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      max_age: '300',
    });

    const response = await app.request(`/auth/native/authorize/google?${query}`);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.protocol}//${location.host}${location.pathname}`).toBe(redirectUri);
    expect(location.searchParams.get('state')).toBe(state);
    expect(location.searchParams.get('error')).toBe('STEP_UP_UNSUPPORTED');
    expect(location.searchParams.has('code')).toBe(false);
  });

  async function beginNativeAuthorization(provider: 'google' | 'apple', desktopState: string) {
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state: desktopState,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const response = await app.request(`/auth/native/authorize/${provider}?${query}`);
    expect(response.status).toBe(302);
    const providerRedirect = new URL(response.headers.get('location') ?? '');
    return providerRedirect.searchParams.get('state') ?? '';
  }

  it('returns GET provider cancellation to the stored native target and consumes state once', async () => {
    const desktopState = 'C'.repeat(64);
    const providerState = await beginNativeAuthorization('google', desktopState);
    const callback = `/auth/oauth/google/callback?error=access_denied&error_description=${encodeURIComponent('untrusted provider detail')}&state=${providerState}`;
    const requestLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = await app.request(callback);
    const logged = requestLog.mock.calls.flat().join(' ');
    requestLog.mockRestore();
    expect(logged).not.toContain(providerState);
    expect(logged).not.toContain('untrusted provider detail');
    expect(logged).not.toContain('/auth/oauth/google/callback?');
    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.protocol}//${location.host}${location.pathname}`).toBe(redirectUri);
    expect(location.searchParams.get('state')).toBe(desktopState);
    expect(location.searchParams.get('error')).toBe('OAUTH_AUTH_FAILED');
    expect(location.searchParams.get('error_description')).toBe(
      'OAuth authorization did not complete.',
    );
    expect(location.toString()).not.toContain('untrusted');
    expect(location.searchParams.has('code')).toBe(false);

    const replay = await app.request(callback);
    expect(replay.status).toBe(401);
    expect(replay.headers.get('location')).toBeNull();
  });

  it('returns Apple form_post cancellation to the stored native target', async () => {
    const desktopState = 'A'.repeat(64);
    const providerState = await beginNativeAuthorization('apple', desktopState);
    const body = new URLSearchParams({
      error: 'user_cancelled_authorize',
      error_description: 'provider detail must not be reflected',
      state: providerState,
    });
    const response = await app.request('/auth/oauth/apple/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.searchParams.get('state')).toBe(desktopState);
    expect(location.searchParams.get('error')).toBe('OAUTH_AUTH_FAILED');
    expect(location.toString()).not.toContain('provider+detail');
  });

  it.each([
    [
      'token exchange',
      [
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ],
      'OAUTH_AUTH_FAILED',
    ],
    [
      'user info',
      [
        new Response(JSON.stringify({ access_token: 'provider-access-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        new Response(JSON.stringify({ error: 'upstream_failure' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }),
      ],
      'OAUTH_USER_INFO_FAILED',
    ],
  ])('returns %s failures to the stored native target', async (_label, responses, errorCode) => {
    const desktopState = randomUUID().replaceAll('-', '').repeat(2);
    const providerState = await beginNativeAuthorization('google', desktopState);
    const providerFetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(responses.shift() ?? new Response(null, { status: 500 })),
      );
    vi.stubGlobal('fetch', providerFetch);
    try {
      const response = await app.request(
        `/auth/oauth/google/callback?code=provider-code&state=${providerState}`,
      );
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.searchParams.get('state')).toBe(desktopState);
      expect(location.searchParams.get('error')).toBe(errorCode);
      expect(location.searchParams.has('code')).toBe(false);
      expect(location.toString()).not.toContain('provider-access-token');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('exchanges once, validates and revokes a bearer session without CSRF', async () => {
    const exchange = () =>
      app.request('/auth/native/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantType: 'authorization_code',
          clientId,
          code: rawCode,
          redirectUri,
          codeVerifier,
        }),
      });

    const response = await exchange();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      success: true;
      data: { token: string; tokenType: 'Bearer' };
    };
    expect(body.data.tokenType).toBe('Bearer');

    const replay = await exchange();
    expect(replay.status).toBe(400);

    const session = await app.request('/auth/native/session', {
      headers: { Authorization: `Bearer ${body.data.token}` },
    });
    expect(session.status).toBe(200);

    const introspect = (secret: string, requestedAudience = audience, extras = {}) =>
      app.request('/auth/resource/introspect', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Forwarded-For': '203.0.113.10',
        },
        body: new URLSearchParams({
          token: body.data.token,
          audience: requestedAudience,
          ...extras,
        }),
      });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const active = await introspect(resourceSecret);
    const logged = [...log.mock.calls, ...errorLog.mock.calls].flat().join(' ');
    log.mockRestore();
    errorLog.mockRestore();
    expect(active.status).toBe(200);
    expect(active.headers.get('cache-control')).toBe('no-store');
    const activeBody = (await active.json()) as Record<string, unknown>;
    const sqlite = new Database(dbPath, { readonly: true });
    const persistedSession = sqlite
      .prepare('SELECT id, expires_at FROM sessions WHERE selector = ?')
      .get(body.data.token.split(':')[0]) as { id: string; expires_at: string };
    sqlite.close();
    expect(Object.keys(activeBody).sort()).toEqual(
      [
        'active',
        'aud',
        'auth_time',
        'client_id',
        'email',
        'email_verified',
        'exp',
        'sid',
        'sub',
      ].sort(),
    );
    expect(activeBody).toEqual({
      active: true,
      sub: userId,
      email: 'native-route@example.com',
      email_verified: true,
      aud: audience,
      client_id: clientId,
      exp: Math.floor(new Date(persistedSession.expires_at).getTime() / 1000),
      sid: persistedSession.id,
      auth_time: null,
    });
    expect(logged).not.toContain(body.data.token);
    expect(logged).not.toContain(resourceSecret);
    expect(logged).not.toContain('native-route@example.com');
    expect(logged).not.toContain('/auth/resource/introspect');

    const rotated = await introspect(rotatedResourceSecret);
    expect(rotated.status).toBe(200);
    expect(await rotated.json()).toMatchObject({ active: true, aud: audience });

    const crossAudience = await introspect(otherResourceSecret, audience);
    expect(crossAudience.status).toBe(200);
    expect(await crossAudience.json()).toEqual({ active: false });

    const wrongRequestedAudience = await introspect(resourceSecret, otherAudience);
    expect(wrongRequestedAudience.status).toBe(200);
    expect(await wrongRequestedAudience.json()).toEqual({ active: false });

    const invalidCredential = await introspect('invalid-resource-secret'.padEnd(64, 'z'));
    expect(invalidCredential.status).toBe(401);
    expect(await invalidCredential.json()).toEqual({ active: false });

    const disabledCredential = await introspect(disabledResourceSecret);
    expect(disabledCredential.status).toBe(401);
    expect(await disabledCredential.json()).toEqual({ active: false });

    const malformedCredential = await app.request('/auth/resource/introspect', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer malformed credential',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: body.data.token, audience }),
    });
    expect(malformedCredential.status).toBe(401);
    expect(await malformedCredential.json()).toEqual({ active: false });

    const oversizedCredential = await app.request('/auth/resource/introspect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${'x'.repeat(400)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: body.data.token, audience }),
    });
    expect(oversizedCredential.status).toBe(401);
    expect(await oversizedCredential.json()).toEqual({ active: false });

    const missingCredential = await app.request('/auth/resource/introspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: body.data.token, audience }),
    });
    expect(missingCredential.status).toBe(401);

    const malformedToken = await app.request('/auth/resource/introspect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resourceSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: 'malformed', audience }),
    });
    expect(malformedToken.status).toBe(200);
    expect(await malformedToken.json()).toEqual({ active: false });

    const appendedToken = await app.request('/auth/resource/introspect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resourceSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: `${body.data.token}:junk`, audience }),
    });
    expect(appendedToken.status).toBe(200);
    expect(await appendedToken.json()).toEqual({ active: false });

    const callerClaims = await introspect(resourceSecret, audience, { sub: 'attacker' });
    expect(callerClaims.status).toBe(400);
    expect(await callerClaims.json()).toEqual({ active: false });

    const wrongContentType = await app.request('/auth/resource/introspect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resourceSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: body.data.token, audience }),
    });
    expect(wrongContentType.status).toBe(415);

    const contentTypeWithCharset = await app.request('/auth/resource/introspect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resourceSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body: new URLSearchParams({ token: body.data.token, audience }),
    });
    expect(contentTypeWithCharset.status).toBe(415);

    const oversized = await app.request('/auth/resource/introspect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resourceSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: 'x'.repeat(2_000), audience }),
    });
    expect(oversized.status).toBe(413);

    const logout = await app.request('/auth/native/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${body.data.token}` },
    });
    expect(logout.status).toBe(200);

    const revoked = await app.request('/auth/native/session', {
      headers: { Authorization: `Bearer ${body.data.token}` },
    });
    expect(revoked.status).toBe(401);

    const inactive = await introspect(resourceSecret);
    expect(inactive.status).toBe(200);
    expect(await inactive.json()).toEqual({ active: false });

    let limited: Response | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = await introspect(resourceSecret);
      if (candidate.status === 429) {
        limited = candidate;
        break;
      }
    }
    expect(limited?.status).toBe(429);
    expect(await limited?.json()).toEqual({ active: false });

    const browserLogout = await app.request('/auth/logout', { method: 'POST' });
    expect(browserLogout.status).toBe(403);
  });
});
