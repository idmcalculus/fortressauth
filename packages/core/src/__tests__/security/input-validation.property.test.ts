/**
 * Property-Based Tests for Input Validation
 *
 * Feature: fortressauth-platform, Property 20: Input Sanitization
 * Feature: fortressauth-platform, Property 21: Email Format Validation
 * Validates: Requirements 17.1, 17.2, 17.3, 17.4
 */

import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { FortressAuth } from '../../fortress.js';
import type { AuthRepository } from '../../ports/auth-repository.js';
import type { EmailProviderPort } from '../../ports/email-provider.js';
import type { RateLimiterPort } from '../../ports/rate-limiter.js';
import { FortressConfigSchema } from '../../schemas/config.js';
import {
  containsControlCharacters,
  MAX_EMAIL_LENGTH,
  normalizeEmail,
} from '../../security/input-validation.js';
import { ok } from '../../types/result.js';

const MAX_PASSWORD_LENGTH = FortressConfigSchema.parse({}).password.maxLength;

const emailSchema = z.string().email();

const controlCharArb = fc.oneof(
  fc.integer({ min: 0, max: 31 }).map((code) => String.fromCharCode(code)),
  fc.constant(String.fromCharCode(127)),
  fc.integer({ min: 128, max: 159 }).map((code) => String.fromCharCode(code)),
);

const stringWithControlCharArb = fc
  .tuple(fc.string({ maxLength: 64 }), controlCharArb, fc.string({ maxLength: 64 }))
  .map(([prefix, control, suffix]) => `${prefix}${control}${suffix}`);

const emailTooLongArb = fc.string({
  minLength: MAX_EMAIL_LENGTH + 1,
  maxLength: MAX_EMAIL_LENGTH + 64,
});

const invalidEmailSanitizationArb = fc.oneof(stringWithControlCharArb, emailTooLongArb);

const passwordTooLongArb = fc.string({
  minLength: MAX_PASSWORD_LENGTH + 1,
  maxLength: MAX_PASSWORD_LENGTH + 64,
});

const invalidPasswordSanitizationArb = fc.oneof(stringWithControlCharArb, passwordTooLongArb);

const invalidEmailFormatArb = fc
  .string({ minLength: 1, maxLength: MAX_EMAIL_LENGTH })
  .filter((value) => !containsControlCharacters(value))
  .filter((value) => !emailSchema.safeParse(normalizeEmail(value)).success);

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

  return { fortress, repository, rateLimiter };
}

describe('Property 20: Input Sanitization', () => {
  it('rejects emails with control chars or excessive length before processing', async () => {
    await fc.assert(
      fc.asyncProperty(invalidEmailSanitizationArb, async (email) => {
        const { fortress, repository, rateLimiter } = createTestFortress();
        const result = await fortress.signUp({
          email,
          password: 'SecurePass123!',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('INVALID_EMAIL');
        }
        expect(repository.findUserByEmail).not.toHaveBeenCalled();
        expect(rateLimiter.check).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('rejects passwords with control chars or excessive length before processing', async () => {
    await fc.assert(
      fc.asyncProperty(invalidPasswordSanitizationArb, async (password) => {
        const { fortress, repository, rateLimiter } = createTestFortress();
        const result = await fortress.signUp({
          email: 'valid@example.com',
          password,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('INVALID_PASSWORD');
        }
        expect(repository.findUserByEmail).not.toHaveBeenCalled();
        expect(rateLimiter.check).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 21: Email Format Validation', () => {
  it('rejects RFC 5322-invalid emails for signUp, signIn, and password reset', async () => {
    await fc.assert(
      fc.asyncProperty(invalidEmailFormatArb, async (email) => {
        const signup = createTestFortress();
        const signupResult = await signup.fortress.signUp({
          email,
          password: 'SecurePass123!',
        });

        expect(signupResult.success).toBe(false);
        if (!signupResult.success) {
          expect(signupResult.error).toBe('INVALID_EMAIL');
        }
        expect(signup.repository.findUserByEmail).not.toHaveBeenCalled();
        expect(signup.rateLimiter.check).not.toHaveBeenCalled();

        const signin = createTestFortress();
        const signinResult = await signin.fortress.signIn({
          email,
          password: 'SecurePass123!',
        });

        expect(signinResult.success).toBe(false);
        if (!signinResult.success) {
          expect(signinResult.error).toBe('INVALID_EMAIL');
        }
        expect(signin.repository.findUserByEmail).not.toHaveBeenCalled();
        expect(signin.rateLimiter.check).not.toHaveBeenCalled();

        const reset = createTestFortress();
        const resetResult = await reset.fortress.requestPasswordReset(email);

        expect(resetResult.success).toBe(false);
        if (!resetResult.success) {
          expect(resetResult.error).toBe('INVALID_EMAIL');
        }
        expect(reset.repository.findUserByEmail).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
