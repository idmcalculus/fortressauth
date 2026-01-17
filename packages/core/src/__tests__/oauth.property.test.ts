import * as fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthProviderId } from '../domain/entities/account.js';
import { OAuthState } from '../domain/entities/oauth-state.js';
import { User } from '../domain/entities/user.js';
import { FortressAuth } from '../fortress.js';
import type { AuthRepository } from '../ports/auth-repository.js';
import type { EmailProviderPort } from '../ports/email-provider.js';
import type { OAuthProviderPort } from '../ports/oauth-provider.js';
import type { RateLimiterPort } from '../ports/rate-limiter.js';
import { ok } from '../types/result.js';

describe('OAuth Property Tests', () => {
  let repository: AuthRepository;
  let rateLimiter: RateLimiterPort;
  let emailProvider: EmailProviderPort;
  let fortress: FortressAuth;

  beforeEach(() => {
    repository = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
      createUser: vi.fn().mockResolvedValue(ok(undefined)),
      updateUser: vi.fn(),
      findAccountByProvider: vi.fn(),
      findEmailAccountByUserId: vi.fn(),
      createAccount: vi.fn(),
      updateEmailAccountPassword: vi.fn(),
      findSessionBySelector: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteSessionsByUserId: vi.fn(),
      createEmailVerificationToken: vi.fn(),
      findEmailVerificationBySelector: vi.fn(),
      deleteEmailVerification: vi.fn(),
      createPasswordResetToken: vi.fn(),
      findPasswordResetBySelector: vi.fn(),
      findPasswordResetsByUserId: vi.fn(),
      deletePasswordReset: vi.fn(),
      createOAuthState: vi.fn(),
      findOAuthStateByState: vi.fn(),
      deleteOAuthState: vi.fn(),
      recordLoginAttempt: vi.fn(),
      countRecentFailedAttempts: vi.fn(),
      transaction: vi.fn((fn) => fn(repository)),
    } as unknown as AuthRepository;

    rateLimiter = {
      check: vi.fn().mockResolvedValue({
        allowed: true,
        remaining: 5,
        resetAt: new Date(),
        retryAfterMs: 0,
      }),
      consume: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    };

    emailProvider = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    };

    fortress = new FortressAuth(repository, rateLimiter, emailProvider, {
      urls: { baseUrl: 'http://localhost:3000' },
    });
  });

  it('Property 26: OAuth State Parameter Validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<OAuthProviderId>(
          'google',
          'github',
          'apple',
          'twitter',
          'discord',
          'linkedin',
          'microsoft',
        ),
        fc.string({ minLength: 10 }),
        async (providerId, _stateStr) => {
          const provider = {
            getAuthorizationUrl: vi.fn().mockReturnValue('http://auth.url'),
          } as unknown as OAuthProviderPort;

          const url = await fortress.getOAuthAuthorizationUrl(provider, providerId);
          expect(url).toBe('http://auth.url');
          expect(repository.createOAuthState).toHaveBeenCalledWith(
            expect.objectContaining({
              providerId,
              state: expect.any(String),
              codeVerifier: expect.any(String),
            }),
          );

          const calls = vi.mocked(repository.createOAuthState).mock.calls;
          const capturedState = calls[0]?.[0];
          if (!capturedState) {
            throw new Error('OAuth state was not created');
          }

          // Test mismatch
          vi.mocked(repository.findOAuthStateByState).mockResolvedValueOnce(null);
          const mismatchResult = await fortress.handleOAuthCallback(
            provider,
            providerId,
            'code',
            'wrong-state',
          );
          if (mismatchResult.success) {
            throw new Error('Should have failed');
          }
          expect(mismatchResult.error).toBe('OAUTH_STATE_MISMATCH');

          // Test expired
          const expiredState = OAuthState.rehydrate({
            ...capturedState,
            expiresAt: new Date(Date.now() - 1000),
          });
          vi.mocked(repository.findOAuthStateByState).mockResolvedValueOnce(expiredState);
          const expiredResult = await fortress.handleOAuthCallback(
            provider,
            providerId,
            'code',
            capturedState.state,
          );
          if (expiredResult.success) {
            throw new Error('Should have failed');
          }
          expect(expiredResult.error).toBe('OAUTH_STATE_MISMATCH');
          expect(repository.deleteOAuthState).toHaveBeenCalledWith(expiredState.id);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('Property 27: OAuth Account Linking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<OAuthProviderId>('google', 'github'),
        fc
          .tuple(fc.stringMatching(/^[a-z]+$/), fc.stringMatching(/^[a-z]+$/))
          .map(([local, domain]) => `${local || 'user'}@${domain || 'example'}.com`),
        fc.stringMatching(/^[a-zA-Z0-9]+$/).filter((s) => s.length > 0),
        async (providerId, email, providerUserId) => {
          vi.clearAllMocks();
          const state = OAuthState.create({ providerId, state: 'state' });
          vi.mocked(repository.findOAuthStateByState).mockResolvedValue(state);

          const provider = {
            validateCallback: vi.fn().mockResolvedValue(ok({ accessToken: 'at' })),
            getUserInfo: vi
              .fn()
              .mockResolvedValue(ok({ id: providerUserId, email, emailVerified: true })),
          } as unknown as OAuthProviderPort;

          // Case 1: New user
          vi.mocked(repository.findAccountByProvider).mockResolvedValue(null);
          vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

          const result1 = await fortress.handleOAuthCallback(provider, providerId, 'code', 'state');
          expect(result1.success).toBe(true);
          expect(repository.createUser).toHaveBeenCalled();
          expect(repository.createAccount).toHaveBeenCalledWith(
            expect.objectContaining({ providerId, providerUserId }),
          );

          // Case 2: Existing user (linking)
          vi.clearAllMocks();
          vi.mocked(repository.findOAuthStateByState).mockResolvedValue(state);
          const existingUser = User.create(email);
          vi.mocked(repository.findAccountByProvider).mockResolvedValue(null);
          vi.mocked(repository.findUserByEmail).mockResolvedValue(existingUser);

          const result2 = await fortress.handleOAuthCallback(provider, providerId, 'code', 'state');
          expect(result2.success).toBe(true);
          expect(repository.createUser).not.toHaveBeenCalled();
          expect(repository.createAccount).toHaveBeenCalledWith(
            expect.objectContaining({ userId: existingUser.id, providerId, providerUserId }),
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  it('Property 28: OAuth Provider User ID Storage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<OAuthProviderId>('google', 'github'),
        fc.string({ minLength: 5 }),
        async (providerId, providerUserId) => {
          vi.clearAllMocks();
          const state = OAuthState.create({ providerId, state: 'state' });
          vi.mocked(repository.findOAuthStateByState).mockResolvedValue(state);

          const provider = {
            validateCallback: vi.fn().mockResolvedValue(ok({ accessToken: 'at' })),
            getUserInfo: vi
              .fn()
              .mockResolvedValue(
                ok({ id: providerUserId, email: 'test@example.com', emailVerified: true }),
              ),
          } as unknown as OAuthProviderPort;

          vi.mocked(repository.findAccountByProvider).mockResolvedValue(null);
          vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

          await fortress.handleOAuthCallback(provider, providerId, 'code', 'state');

          expect(repository.createAccount).toHaveBeenCalledWith(
            expect.objectContaining({
              providerId,
              providerUserId,
            }),
          );
        },
      ),
      { numRuns: 20 },
    );
  });
});
