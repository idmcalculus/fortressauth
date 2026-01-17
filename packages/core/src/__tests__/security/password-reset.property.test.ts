/**
 * Property-Based Tests for Password Reset Security
 *
 * Feature: fortressauth-platform, Property 14: Password Reset Email Enumeration Prevention
 * Feature: fortressauth-platform, Property 15: Password Reset Invalidates Sessions
 * Validates: Requirements 5.2, 5.5, 5.8, 5.9, 5.10
 */

import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../../domain/entities/account.js';
import { PasswordResetToken } from '../../domain/entities/password-reset-token.js';
import { User } from '../../domain/entities/user.js';
import { FortressAuth } from '../../fortress.js';
import type { AuthRepository } from '../../ports/auth-repository.js';
import type { EmailProviderPort } from '../../ports/email-provider.js';
import type { RateLimiterPort } from '../../ports/rate-limiter.js';
import { FortressConfigSchema } from '../../schemas/config.js';
import { MAX_EMAIL_LENGTH, validateEmailInput } from '../../security/input-validation.js';
import { ok } from '../../types/result.js';

function createMockRepository(): AuthRepository {
  return {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createUser: vi.fn().mockResolvedValue(ok(undefined)),
    updateUser: vi.fn().mockResolvedValue(undefined),
    findAccountByProvider: vi.fn(),
    findEmailAccountByUserId: vi.fn(),
    createAccount: vi.fn().mockResolvedValue(undefined),
    updateEmailAccountPassword: vi.fn().mockResolvedValue(undefined),
    findSessionBySelector: vi.fn(),
    createSession: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    deleteSessionsByUserId: vi.fn().mockResolvedValue(undefined),
    createEmailVerificationToken: vi.fn().mockResolvedValue(undefined),
    findEmailVerificationBySelector: vi.fn(),
    deleteEmailVerification: vi.fn().mockResolvedValue(undefined),
    createPasswordResetToken: vi.fn().mockResolvedValue(undefined),
    findPasswordResetBySelector: vi.fn(),
    findPasswordResetsByUserId: vi.fn().mockResolvedValue([]),
    deletePasswordReset: vi.fn().mockResolvedValue(undefined),
    recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
    countRecentFailedAttempts: vi.fn().mockResolvedValue(0),
    createOAuthState: vi.fn(),
    findOAuthStateByState: vi.fn(),
    deleteOAuthState: vi.fn(),
    transaction: vi.fn().mockImplementation(async (fn) =>
      fn({
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
        findPasswordResetsByUserId: vi.fn().mockResolvedValue([]),
        deletePasswordReset: vi.fn(),
        recordLoginAttempt: vi.fn(),
        countRecentFailedAttempts: vi.fn().mockResolvedValue(0),
        createOAuthState: vi.fn(),
        findOAuthStateByState: vi.fn(),
        deleteOAuthState: vi.fn(),
        transaction: vi.fn(),
      }),
    ),
  };
}

function createMockRateLimiter(): RateLimiterPort {
  return {
    check: vi
      .fn()
      .mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date(), retryAfterMs: 0 }),
    consume: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockEmailProvider(): EmailProviderPort {
  return {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  };
}

function createTestFortress() {
  const repository = createMockRepository();
  const rateLimiter = createMockRateLimiter();
  const emailProvider = createMockEmailProvider();
  const fortress = new FortressAuth(repository, rateLimiter, emailProvider, {
    urls: { baseUrl: 'http://localhost:3000' },
  });

  return { fortress, repository, rateLimiter, emailProvider };
}

describe('Property 14: Password Reset Email Enumeration Prevention', () => {
  it('returns success regardless of whether the email exists', async () => {
    const validEmailArb = fc
      .emailAddress({ size: 'small' })
      .filter((value) => value.length <= MAX_EMAIL_LENGTH && validateEmailInput(value).success);

    await fc.assert(
      fc.asyncProperty(validEmailArb, fc.boolean(), async (email, exists) => {
        const { fortress, repository, emailProvider } = createTestFortress();
        const user = User.create(email);
        vi.mocked(repository.findUserByEmail).mockResolvedValue(exists ? user : null);
        vi.mocked(repository.findPasswordResetsByUserId).mockResolvedValue([]);

        const result = await fortress.requestPasswordReset(email);

        expect(result.success).toBe(true);
        if (exists) {
          expect(repository.createPasswordResetToken).toHaveBeenCalled();
          expect(emailProvider.sendPasswordResetEmail).toHaveBeenCalled();
        } else {
          expect(repository.createPasswordResetToken).not.toHaveBeenCalled();
          expect(emailProvider.sendPasswordResetEmail).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 25 },
    );
  }, 10000);
});

describe('Property 15: Password Reset Invalidates Sessions', () => {
  it('deletes all sessions for any successful password reset', async () => {
    const config = FortressConfigSchema.parse({});
    const maxLength = Math.min(config.password.maxLength, config.password.minLength + 24);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: config.password.minLength, maxLength }),
        async (newPassword) => {
          const { fortress, repository } = createTestFortress();
          const user = User.create('user@example.com');
          const { token, rawToken } = PasswordResetToken.create(user.id, 3600000);
          const account = Account.createEmailAccount(user.id, user.email, 'old-hash');

          vi.mocked(repository.findPasswordResetBySelector).mockResolvedValue(token);
          vi.mocked(repository.findUserById).mockResolvedValue(user);
          vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);

          const result = await fortress.resetPassword({
            token: rawToken,
            newPassword,
            ipAddress: '127.0.0.1',
          });

          expect(result.success).toBe(true);
          expect(repository.deleteSessionsByUserId).toHaveBeenCalledWith(user.id);
        },
      ),
      { numRuns: 50 },
    );
  }, 60000);
});
