/**
 * Property-Based Tests for Rate Limiting
 *
 * Feature: fortressauth-platform, Property 16: Rate Limiting Enforcement
 * Validates: Requirements 6.2, 6.5, 6.6, 6.7
 */

import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { FortressAuth } from '../../fortress.js';
import type { AuthRepository } from '../../ports/auth-repository.js';
import type { EmailProviderPort } from '../../ports/email-provider.js';
import type { RateLimiterPort } from '../../ports/rate-limiter.js';
import { FortressConfigSchema } from '../../schemas/config.js';
import {
  containsControlCharacters,
  MAX_EMAIL_LENGTH,
  validateEmailInput,
} from '../../security/input-validation.js';
import { ok } from '../../types/result.js';

const config = FortressConfigSchema.parse({});

const validEmailArb = fc
  .emailAddress({ size: 'small' })
  .filter((value) => value.length <= MAX_EMAIL_LENGTH && validateEmailInput(value).success);

const validPasswordArb = fc
  .string({ minLength: config.password.minLength, maxLength: config.password.maxLength })
  .filter((value) => !containsControlCharacters(value));

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
        transaction: vi.fn(),
      }),
    ),
  };
}

function createDeniedRateLimiter(): RateLimiterPort {
  return {
    check: vi
      .fn()
      .mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date(), retryAfterMs: 0 }),
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
  const rateLimiter = createDeniedRateLimiter();
  const emailProvider = createMockEmailProvider();
  const fortress = new FortressAuth(repository, rateLimiter, emailProvider, {
    urls: { baseUrl: 'http://localhost:3000' },
  });

  return { fortress, repository, rateLimiter };
}

describe('Property 16: Rate Limiting Enforcement', () => {
  it('returns RATE_LIMIT_EXCEEDED before signup processing', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository, rateLimiter } = createTestFortress();
        const result = await fortress.signUp({
          email,
          password,
          ipAddress: '203.0.113.10',
          userAgent: 'RateLimitAgent/1.0',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('RATE_LIMIT_EXCEEDED');
        }
        expect(rateLimiter.check).toHaveBeenCalled();
        expect(repository.findUserByEmail).not.toHaveBeenCalled();
      }),
      { numRuns: 25 },
    );
  });

  it('returns RATE_LIMIT_EXCEEDED before login processing', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository, rateLimiter } = createTestFortress();
        const result = await fortress.signIn({
          email,
          password,
          ipAddress: '203.0.113.11',
          userAgent: 'RateLimitAgent/1.0',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('RATE_LIMIT_EXCEEDED');
        }
        expect(rateLimiter.check).toHaveBeenCalled();
        expect(repository.findUserByEmail).not.toHaveBeenCalled();
      }),
      { numRuns: 25 },
    );
  });

  it('returns RATE_LIMIT_EXCEEDED before verify email processing', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 128 }), async (token) => {
        const { fortress, repository, rateLimiter } = createTestFortress();
        const result = await fortress.verifyEmail(token, {
          ipAddress: '203.0.113.12',
          userAgent: 'RateLimitAgent/1.0',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('RATE_LIMIT_EXCEEDED');
        }
        expect(rateLimiter.check).toHaveBeenCalled();
        expect(repository.findEmailVerificationBySelector).not.toHaveBeenCalled();
      }),
      { numRuns: 25 },
    );
  });

  it('returns RATE_LIMIT_EXCEEDED before password reset processing', async () => {
    await fc.assert(
      fc.asyncProperty(validPasswordArb, async (newPassword) => {
        const { fortress, repository, rateLimiter } = createTestFortress();
        const result = await fortress.resetPassword({
          token: 'test-token',
          newPassword,
          ipAddress: '203.0.113.13',
          userAgent: 'RateLimitAgent/1.0',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('RATE_LIMIT_EXCEEDED');
        }
        expect(rateLimiter.check).toHaveBeenCalled();
        expect(repository.findPasswordResetBySelector).not.toHaveBeenCalled();
      }),
      { numRuns: 25 },
    );
  });
});
