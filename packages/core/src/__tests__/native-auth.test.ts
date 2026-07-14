import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../domain/entities/account.js';
import { NativeAuthorizationGrant } from '../domain/entities/native-authorization-grant.js';
import { OAuthState } from '../domain/entities/oauth-state.js';
import { ResourceIntrospectionAuditEvent } from '../domain/entities/resource-introspection-audit-event.js';
import { Session } from '../domain/entities/session.js';
import { User } from '../domain/entities/user.js';
import { FortressAuth } from '../fortress.js';
import type { AuthRepository } from '../ports/auth-repository.js';
import type { EmailProviderPort } from '../ports/email-provider.js';
import type { RateLimiterPort } from '../ports/rate-limiter.js';
import { isAuthenticationFresh } from '../security/authentication-age.js';
import { ok } from '../types/result.js';

const verifier = 'A'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');

function nativeCapabilities() {
  return {
    createNativeAuthorizationGrant: vi.fn(),
    consumeNativeAuthorizationGrant: vi.fn().mockResolvedValue(null),
    consumeOAuthStateByState: vi.fn().mockResolvedValue(null),
  };
}

describe('native authorization', () => {
  it('consumes provider cancellation state and returns only the stored native target', async () => {
    const oauthState = OAuthState.create({
      providerId: 'google',
      state: 'provider-state',
      nativeClientId: 'wraith',
      nativeRedirectUri: 'wraith://auth/callback',
      nativeCodeChallenge: challenge,
      nativeState: 'desktop-state',
    });
    const repository = {
      ...nativeCapabilities(),
      consumeOAuthStateByState: vi
        .fn()
        .mockResolvedValueOnce(oauthState)
        .mockResolvedValueOnce(null),
    } as unknown as AuthRepository;
    const fortress = new FortressAuth(
      repository,
      { check: vi.fn(), consume: vi.fn(), reset: vi.fn() } as unknown as RateLimiterPort,
      {
        sendVerificationEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
      } as EmailProviderPort,
    );

    await expect(fortress.consumeNativeOAuthFailure('google', 'provider-state')).resolves.toEqual({
      success: true,
      data: { redirectUri: 'wraith://auth/callback', state: 'desktop-state' },
    });
    await expect(fortress.consumeNativeOAuthFailure('google', 'provider-state')).resolves.toEqual({
      success: false,
      error: 'OAUTH_STATE_MISMATCH',
    });
  });

  it('stores only a hashed one-time code and enforces PKCE', () => {
    const { grant, rawCode } = NativeAuthorizationGrant.create({
      userId: 'user-1',
      clientId: 'wraith',
      redirectUri: 'wraith://auth/callback',
      codeChallenge: challenge,
      ttlMs: 60_000,
    });
    const parsed = NativeAuthorizationGrant.parse(rawCode);
    expect(parsed).not.toBeNull();
    expect(grant.verifierHash).not.toContain(parsed?.verifier ?? 'missing');
    expect(grant.matchesCodeVerifierHash(parsed?.verifier ?? '')).toBe(true);
    expect(grant.matchesPkceVerifier(verifier)).toBe(true);
    expect(grant.matchesPkceVerifier(`B${verifier.slice(1)}`)).toBe(false);
    expect(NativeAuthorizationGrant.parse(`${rawCode}:extra`)).toBeNull();
  });

  it('atomically consumes a grant and creates a bearer session', async () => {
    const user = User.create('desktop@example.com').withEmailVerified();
    const { grant, rawCode } = NativeAuthorizationGrant.create({
      userId: user.id,
      clientId: 'wraith',
      redirectUri: 'wraith://auth/callback',
      codeChallenge: challenge,
      ttlMs: 60_000,
    });
    const repository = {
      ...nativeCapabilities(),
      consumeNativeAuthorizationGrant: vi.fn().mockResolvedValueOnce(grant),
      findUserById: vi.fn().mockResolvedValue(user),
      createSession: vi.fn(),
    } as unknown as AuthRepository;
    const fortress = new FortressAuth(
      repository,
      { check: vi.fn(), consume: vi.fn(), reset: vi.fn() } as unknown as RateLimiterPort,
      {
        sendVerificationEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
      } as EmailProviderPort,
      { session: { ttlMs: 7 * 24 * 60 * 60 * 1000 }, nativeAuth: { sessionTtlMs: 600_000 } },
    );

    const result = await fortress.exchangeNativeAuthorizationCode({
      clientId: 'wraith',
      code: rawCode,
      redirectUri: 'wraith://auth/callback',
      codeVerifier: verifier,
    });

    expect(result.success).toBe(true);
    expect(repository.createSession).toHaveBeenCalledOnce();
    const createdSession = vi.mocked(repository.createSession).mock.calls[0]?.[0];
    expect(createdSession).toBeDefined();
    expect(createdSession?.expiresAt.getTime() - createdSession.createdAt.getTime()).toBe(600_000);
    expect(createdSession?.nativeClientId).toBe('wraith');
    expect(createdSession?.nativeAudiences).toEqual([]);
  });

  it('introspects only an exactly bound native client and audience', async () => {
    const user = User.create('resource@example.com').withEmailVerified();
    const authTime = new Date(Date.now() - 10_000);
    const { session, rawToken } = Session.createNative({
      userId: user.id,
      ttlMs: 600_000,
      clientId: 'desktop-app',
      grantedAudiences: ['desktop-api'],
      email: null,
      emailVerified: true,
      authenticationTime: authTime,
    });
    const repository = {
      ...nativeCapabilities(),
      findSessionBySelector: vi.fn().mockResolvedValue(session),
      findUserById: vi.fn().mockResolvedValue(user),
      deleteSession: vi.fn(),
    } as unknown as AuthRepository;
    const fortress = new FortressAuth(
      repository,
      { check: vi.fn(), consume: vi.fn(), reset: vi.fn() } as unknown as RateLimiterPort,
      { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() },
      {
        nativeAuth: {
          clients: [
            {
              clientId: 'desktop-app',
              redirectUris: ['desktop-app://auth/callback'],
              resourceAudiences: ['desktop-api'],
            },
          ],
          resourceServers: [{ audience: 'desktop-api', allowedClientIds: ['desktop-app'] }],
        },
      },
    );

    await expect(
      fortress.introspectNativeSession({
        token: rawToken,
        audience: 'desktop-api',
        authenticatedResourceAudience: 'desktop-api',
      }),
    ).resolves.toMatchObject({
      userId: user.id,
      email: null,
      emailVerified: true,
      clientId: 'desktop-app',
      audience: 'desktop-api',
      sessionId: session.id,
      authenticationTime: authTime,
    });

    await expect(
      fortress.introspectNativeSession({
        token: rawToken,
        audience: 'other-api',
        authenticatedResourceAudience: 'desktop-api',
      }),
    ).resolves.toBeNull();
  });

  it('fails closed for legacy sessions and does not grant newly configured audiences retroactively', async () => {
    const user = User.create('legacy@example.com').withEmailVerified();
    const legacy = Session.create(user.id, 600_000);
    const noAudience = Session.createNative({
      userId: user.id,
      ttlMs: 600_000,
      clientId: 'desktop-app',
      grantedAudiences: [],
      email: user.email,
      emailVerified: true,
      authenticationTime: null,
    });
    const repository = {
      ...nativeCapabilities(),
      findSessionBySelector: vi
        .fn()
        .mockResolvedValueOnce(legacy.session)
        .mockResolvedValueOnce(noAudience.session),
      findUserById: vi.fn().mockResolvedValue(user),
    } as unknown as AuthRepository;
    const fortress = new FortressAuth(
      repository,
      { check: vi.fn(), consume: vi.fn(), reset: vi.fn() } as unknown as RateLimiterPort,
      { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() },
      {
        nativeAuth: {
          clients: [
            {
              clientId: 'desktop-app',
              redirectUris: ['desktop-app://auth/callback'],
              resourceAudiences: ['desktop-api'],
            },
          ],
          resourceServers: [{ audience: 'desktop-api', allowedClientIds: ['desktop-app'] }],
        },
      },
    );
    const request = (token: string) =>
      fortress.introspectNativeSession({
        token,
        audience: 'desktop-api',
        authenticatedResourceAudience: 'desktop-api',
      });

    await expect(request(legacy.rawToken)).resolves.toBeNull();
    await expect(request(noAudience.rawToken)).resolves.toBeNull();
  });

  it('returns inactive for malformed, revoked, expired, and disabled-account sessions', async () => {
    const user = User.create('inactive@example.com').withEmailVerified();
    const created = Session.createNative({
      userId: user.id,
      ttlMs: 600_000,
      clientId: 'desktop-app',
      grantedAudiences: ['desktop-api'],
      email: user.email,
      emailVerified: true,
      authenticationTime: null,
    });
    const disabled = user.withDisabled();
    const expired = Session.rehydrate({
      id: created.session.id,
      userId: created.session.userId,
      selector: created.session.selector,
      verifierHash: created.session.verifierHash,
      expiresAt: new Date(Date.now() - 1),
      ipAddress: created.session.ipAddress,
      userAgent: created.session.userAgent,
      createdAt: created.session.createdAt,
      nativeClientId: created.session.nativeClientId,
      nativeAudiences: created.session.nativeAudiences,
      nativeEmail: created.session.nativeEmail,
      nativeEmailVerified: created.session.nativeEmailVerified,
      authenticationTime: created.session.authenticationTime,
    });
    const repository = {
      ...nativeCapabilities(),
      findSessionBySelector: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(expired)
        .mockResolvedValueOnce(created.session),
      findUserById: vi.fn().mockResolvedValue(disabled),
      deleteSession: vi.fn(),
    } as unknown as AuthRepository;
    const fortress = new FortressAuth(
      repository,
      { check: vi.fn(), consume: vi.fn(), reset: vi.fn() } as unknown as RateLimiterPort,
      { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() },
      {
        nativeAuth: {
          clients: [
            {
              clientId: 'desktop-app',
              redirectUris: ['desktop-app://auth/callback'],
              resourceAudiences: ['desktop-api'],
            },
          ],
          resourceServers: [{ audience: 'desktop-api', allowedClientIds: ['desktop-app'] }],
        },
      },
    );
    const request = (token: string) =>
      fortress.introspectNativeSession({
        token,
        audience: 'desktop-api',
        authenticatedResourceAudience: 'desktop-api',
      });

    await expect(request('malformed')).resolves.toBeNull();
    await expect(request(created.rawToken)).resolves.toBeNull();
    await expect(request(created.rawToken)).resolves.toBeNull();
    await expect(request(created.rawToken)).resolves.toBeNull();
  });

  it('fails unsupported step-up before storing provider state', async () => {
    const repository = {
      ...nativeCapabilities(),
      createOAuthState: vi.fn(),
    } as unknown as AuthRepository;
    const fortress = new FortressAuth(
      repository,
      { check: vi.fn(), consume: vi.fn(), reset: vi.fn() } as unknown as RateLimiterPort,
      { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() },
      {
        nativeAuth: {
          clients: [
            {
              clientId: 'desktop-app',
              redirectUris: ['desktop-app://auth/callback'],
              resourceAudiences: ['desktop-api'],
            },
          ],
          resourceServers: [{ audience: 'desktop-api', allowedClientIds: ['desktop-app'] }],
        },
      },
    );
    const provider = {
      getAuthorizationUrl: vi.fn(),
    } as never;
    await expect(
      fortress.getOAuthAuthorizationUrl(provider, 'google', {
        native: {
          clientId: 'desktop-app',
          redirectUri: 'desktop-app://auth/callback',
          codeChallenge: challenge,
          state: 'S'.repeat(64),
          audience: 'desktop-api',
          maxAgeSeconds: 300,
        },
      }),
    ).rejects.toThrow('STEP_UP_UNSUPPORTED');
    expect(repository.createOAuthState).not.toHaveBeenCalled();
  });

  it.each([
    -1, 0, 1.5, 86_401,
  ])('rejects an out-of-bounds authentication age of %s', async (maxAgeSeconds) => {
    const repository = {
      ...nativeCapabilities(),
      createOAuthState: vi.fn(),
    } as unknown as AuthRepository;
    const fortress = new FortressAuth(
      repository,
      { check: vi.fn(), consume: vi.fn(), reset: vi.fn() } as unknown as RateLimiterPort,
      { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() },
      {
        nativeAuth: {
          clients: [
            {
              clientId: 'desktop-app',
              redirectUris: ['desktop-app://auth/callback'],
              resourceAudiences: ['desktop-api'],
            },
          ],
          resourceServers: [{ audience: 'desktop-api', allowedClientIds: ['desktop-app'] }],
        },
      },
    );
    const provider = {
      supportsFreshAuthentication: true as const,
      getAuthorizationUrl: vi.fn(),
    } as never;

    await expect(
      fortress.getOAuthAuthorizationUrl(provider, 'google', {
        native: {
          clientId: 'desktop-app',
          redirectUri: 'desktop-app://auth/callback',
          codeChallenge: challenge,
          state: 'S'.repeat(64),
          audience: 'desktop-api',
          maxAgeSeconds,
        },
      }),
    ).rejects.toThrow('STEP_UP_FAILED');
    expect(repository.createOAuthState).not.toHaveBeenCalled();
  });

  it('records auth time only from fresh provider evidence satisfying the bound request', async () => {
    const user = User.create('fresh@example.com').withEmailVerified();
    const account = Account.createOAuthAccount(user.id, 'google', 'provider-user');
    let storedState: OAuthState | null = null;
    let storedGrant: NativeAuthorizationGrant | null = null;
    const repository = {
      ...nativeCapabilities(),
      createOAuthState: vi.fn(async (state: OAuthState) => {
        storedState = state;
      }),
      consumeOAuthStateByState: vi.fn(async () => storedState),
      findAccountByProvider: vi.fn().mockResolvedValue(account),
      findUserById: vi.fn().mockResolvedValue(user),
      createNativeAuthorizationGrant: vi.fn(async (grant: NativeAuthorizationGrant) => {
        storedGrant = grant;
      }),
      transaction: vi.fn(async (fn) => fn(repository)),
    } as unknown as AuthRepository;
    const authenticatedAt = new Date();
    const provider = {
      supportsFreshAuthentication: true as const,
      getAuthorizationUrl: vi.fn(() => 'https://provider.example/authorize'),
      validateCallback: vi.fn(async () =>
        ok({
          accessToken: 'provider-token',
          authenticationEvidence: {
            authenticatedAt,
            providerVerified: true as const,
            ceremony: 'fresh' as const,
          },
        }),
      ),
      getUserInfo: vi.fn(async () =>
        ok({ id: 'provider-user', email: user.email, emailVerified: true }),
      ),
    };
    const fortress = new FortressAuth(
      repository,
      { check: vi.fn(), consume: vi.fn(), reset: vi.fn() } as unknown as RateLimiterPort,
      { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() },
      {
        nativeAuth: {
          clients: [
            {
              clientId: 'desktop-app',
              redirectUris: ['desktop-app://auth/callback'],
              resourceAudiences: ['desktop-api'],
            },
          ],
          resourceServers: [{ audience: 'desktop-api', allowedClientIds: ['desktop-app'] }],
        },
      },
    );
    await fortress.getOAuthAuthorizationUrl(provider, 'google', {
      native: {
        clientId: 'desktop-app',
        redirectUri: 'desktop-app://auth/callback',
        codeChallenge: challenge,
        state: 'S'.repeat(64),
        audience: 'desktop-api',
        maxAgeSeconds: 300,
      },
    });
    const result = await fortress.handleOAuthCallback(
      provider,
      'google',
      'provider-code',
      storedState?.state ?? '',
    );

    expect(result.success).toBe(true);
    expect(storedGrant).not.toBeNull();
    expect((storedGrant as NativeAuthorizationGrant | null)?.authenticationTime).toEqual(
      authenticatedAt,
    );
    expect((storedGrant as NativeAuthorizationGrant | null)?.requestedAudience).toBe('desktop-api');
  });

  it('rejects absent or stale authentication time for sensitive-operation policy', () => {
    expect(isAuthenticationFresh(null, 300)).toBe(false);
    expect(isAuthenticationFresh(new Date(Date.now() - 301_000), 300)).toBe(false);
    expect(isAuthenticationFresh(new Date(Date.now() - 10_000), 300)).toBe(true);
  });

  it('creates append-only audit evidence without plaintext security identifiers', () => {
    const event = ResourceIntrospectionAuditEvent.create({
      resourceServerAudience: 'desktop-api',
      requestedAudience: 'desktop-api',
      tokenSelector: '0123456789abcdef0123456789abcdef',
      sessionId: 'stable-session-id',
      clientId: 'desktop-app',
      sourceIdentity: '203.0.113.10',
      outcome: 'active',
    });
    const serialized = JSON.stringify(event);

    expect(event.sessionId).toBe('stable-session-id');
    expect(event.outcome).toBe('active');
    expect(event.resourceServerHash).toMatch(/^[0-9a-f]{64}$/);
    expect(event.tokenSelectorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(serialized).not.toContain('desktop-api');
    expect(serialized).not.toContain('desktop-app');
    expect(serialized).not.toContain('203.0.113.10');
    expect(serialized).not.toContain('0123456789abcdef0123456789abcdef');
  });

  it('burns the grant when redirect binding fails', async () => {
    const { grant, rawCode } = NativeAuthorizationGrant.create({
      userId: 'user-1',
      clientId: 'wraith',
      redirectUri: 'wraith://auth/callback',
      codeChallenge: challenge,
      ttlMs: 60_000,
    });
    const repository = {
      ...nativeCapabilities(),
      consumeNativeAuthorizationGrant: vi.fn().mockResolvedValue(grant),
      findUserById: vi.fn(),
      createSession: vi.fn(),
    } as unknown as AuthRepository;
    const fortress = new FortressAuth(
      repository,
      { check: vi.fn(), consume: vi.fn(), reset: vi.fn() } as unknown as RateLimiterPort,
      {
        sendVerificationEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
      } as EmailProviderPort,
    );
    const result = await fortress.exchangeNativeAuthorizationCode({
      clientId: 'wraith',
      code: rawCode,
      redirectUri: 'wraith://attacker/callback',
      codeVerifier: verifier,
    });
    expect(result).toEqual({ success: false, error: 'NATIVE_AUTHORIZATION_INVALID' });
    expect(repository.consumeNativeAuthorizationGrant).toHaveBeenCalledOnce();
    expect(repository.createSession).not.toHaveBeenCalled();
  });
});
