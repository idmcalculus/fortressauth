/**
 * Property-Based Tests for Core FortressAuth Functionality
 *
 * Feature: fortressauth-platform
 * Property 1: User Registration Creates Valid Records
 * Property 2: Duplicate Email Prevention
 * Property 3: Password Length Validation
 * Property 4: Session Token Format and Storage
 * Property 5: Authentication Round-Trip
 * Property 6: Account Lockout Enforcement
 * Property 7: Email Verification Requirement
 * Property 8: Login Attempt Recording
 * Property 9: Session Expiration
 * Property 10: Session Deletion on Signout
 * Property 11: Email Verification Round-Trip
 * Property 12: Token Expiration Handling
 * Property 13: Invalid Token Rejection
 * Property 17: Account Lockout Lifecycle
 * Property 18: Token Entropy
 * Property 19: No Sensitive Data in Responses
 *
 * Validates: Requirements 1.1-1.8, 2.1-2.6, 3.1-3.5, 4.3-4.5, 5.6, 7.1-7.4, 12.2, 12.5
 */

import * as fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../domain/entities/account.js';
import { EmailVerificationToken } from '../domain/entities/email-verification-token.js';
import { Session } from '../domain/entities/session.js';
import { User } from '../domain/entities/user.js';
import { FortressAuth } from '../fortress.js';
import type { AuthRepository } from '../ports/auth-repository.js';
import type { EmailProviderPort } from '../ports/email-provider.js';
import type { RateLimiterPort } from '../ports/rate-limiter.js';
import { FortressConfigSchema } from '../schemas/config.js';
import { MAX_EMAIL_LENGTH, validateEmailInput } from '../security/input-validation.js';
import { hashPassword } from '../security/password.js';
import { hashVerifier } from '../security/tokens.js';
import { ok } from '../types/result.js';

// ============================================================================
// Test Helpers
// ============================================================================

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

function createTestFortress(configOverrides = {}) {
  const repository = createMockRepository();
  const rateLimiter = createMockRateLimiter();
  const emailProvider = createMockEmailProvider();
  const fortress = new FortressAuth(repository, rateLimiter, emailProvider, {
    urls: { baseUrl: 'http://localhost:3000' },
    rateLimit: { enabled: false },
    ...configOverrides,
  });

  return { fortress, repository, rateLimiter, emailProvider };
}

// ============================================================================
// Arbitraries (Test Data Generators)
// ============================================================================

const config = FortressConfigSchema.parse({});

const validEmailArb = fc
  .emailAddress({ size: 'small' })
  .filter((value) => value.length <= MAX_EMAIL_LENGTH && validateEmailInput(value).success);

const validPasswordArb = fc.string({
  minLength: config.password.minLength,
  maxLength: Math.min(config.password.maxLength, config.password.minLength + 32),
});

const shortPasswordArb = fc.string({
  minLength: 1,
  maxLength: config.password.minLength - 1,
});

const longPasswordArb = fc.string({
  minLength: config.password.maxLength + 1,
  maxLength: config.password.maxLength + 100,
});

// ============================================================================
// Property 1: User Registration Creates Valid Records
// Validates: Requirements 1.1, 1.5, 1.8
// ============================================================================

describe('Property 1: User Registration Creates Valid Records', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates User with normalized lowercase email for any valid email/password', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress();
        vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

        const result = await fortress.signUp({ email, password });

        expect(result.success).toBe(true);
        if (result.success) {
          // Email should be normalized to lowercase
          expect(result.data.user.email).toBe(email.toLowerCase());
        }
      }),
      { numRuns: 100 },
    );
  }, 60000);

  it('creates Account with valid Argon2id password hash for any valid registration', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress();
        vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

        // Capture the account created in the transaction
        let createdAccount: Account | null = null;
        vi.mocked(repository.transaction).mockImplementation(async (fn) => {
          const mockRepo = {
            findUserByEmail: vi.fn(),
            findUserById: vi.fn(),
            createUser: vi.fn().mockResolvedValue(ok(undefined)),
            updateUser: vi.fn(),
            findAccountByProvider: vi.fn(),
            findEmailAccountByUserId: vi.fn(),
            createAccount: vi.fn().mockImplementation((account: Account) => {
              createdAccount = account;
              return Promise.resolve();
            }),
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
          };
          return fn(mockRepo);
        });

        const result = await fortress.signUp({ email, password });

        expect(result.success).toBe(true);
        if (result.success && createdAccount) {
          // Password hash should be Argon2id format
          expect(createdAccount.passwordHash).toMatch(/^\$argon2id\$/);
          // Provider should be 'email'
          expect(createdAccount.providerId).toBe('email');
        }
      }),
      { numRuns: 50 },
    );
  }, 120000);

  it('returns session token for any successful registration', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress();
        vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

        const result = await fortress.signUp({ email, password });

        expect(result.success).toBe(true);
        if (result.success) {
          // Token should be in selector:verifier format
          expect(result.data.token).toMatch(/^[a-f0-9]{32}:[a-f0-9]{64}$/);
        }
      }),
      { numRuns: 100 },
    );
  }, 60000);
});

// ============================================================================
// Property 2: Duplicate Email Prevention
// Validates: Requirements 1.2
// ============================================================================

describe('Property 2: Duplicate Email Prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns EMAIL_EXISTS for any existing email (case-insensitive)', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress();
        const existingUser = User.create(email);
        vi.mocked(repository.findUserByEmail).mockResolvedValue(existingUser);

        const result = await fortress.signUp({ email, password });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('EMAIL_EXISTS');
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it('prevents duplicate records for case variations of same email', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress();
        const lowerEmail = email.toLowerCase();
        const existingUser = User.create(lowerEmail);

        // Simulate case-insensitive lookup
        vi.mocked(repository.findUserByEmail).mockImplementation(async (e) => {
          return e.toLowerCase() === lowerEmail ? existingUser : null;
        });

        // Try with uppercase variation
        const upperEmail = email.toUpperCase();
        const result = await fortress.signUp({ email: upperEmail, password });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('EMAIL_EXISTS');
        }
      }),
      { numRuns: 50 },
    );
  }, 30000);
});

// ============================================================================
// Property 3: Password Length Validation
// Validates: Requirements 1.3, 1.4
// ============================================================================

describe('Property 3: Password Length Validation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns PASSWORD_TOO_WEAK for any password shorter than minLength', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, shortPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress();
        vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

        const result = await fortress.signUp({ email, password });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('PASSWORD_TOO_WEAK');
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it('returns error for any password longer than maxLength', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, longPasswordArb, async (email, password) => {
        const { fortress } = createTestFortress();

        const result = await fortress.signUp({ email, password });

        expect(result.success).toBe(false);
        if (!result.success) {
          // Could be INVALID_PASSWORD (from input validation) or PASSWORD_TOO_WEAK (from password validation)
          // Both are valid rejections for overly long passwords
          expect(['PASSWORD_TOO_WEAK', 'INVALID_PASSWORD']).toContain(result.error);
        }
      }),
      { numRuns: 50 },
    );
  }, 30000);
});

// ============================================================================
// Property 4: Session Token Format and Storage
// Validates: Requirements 1.6, 2.1, 3.1, 3.2
// ============================================================================

describe('Property 4: Session Token Format and Storage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates tokens in selector:verifier format with correct lengths', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.integer({ min: 1000, max: 86400000 }), (userId, ttlMs) => {
        const { session, rawToken } = Session.create(userId, ttlMs);
        const [selector, verifier] = rawToken.split(':');

        // Selector is 32 hex chars (16 bytes)
        expect(selector).toHaveLength(32);
        expect(/^[0-9a-f]+$/.test(selector)).toBe(true);

        // Verifier is 64 hex chars (32 bytes)
        expect(verifier).toHaveLength(64);
        expect(/^[0-9a-f]+$/.test(verifier)).toBe(true);

        // Only hash is stored, not raw verifier
        expect(session.verifierHash).not.toBe(verifier);
        expect(session.verifierHash).toBe(hashVerifier(verifier));
      }),
      { numRuns: 100 },
    );
  });

  it('stores only SHA-256 hash of verifier in session', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.integer({ min: 1000, max: 86400000 }), (userId, ttlMs) => {
        const { session, rawToken } = Session.create(userId, ttlMs);
        const [, verifier] = rawToken.split(':');

        // Verifier hash should be SHA-256 (64 hex chars)
        expect(session.verifierHash).toHaveLength(64);
        expect(/^[0-9a-f]+$/.test(session.verifierHash)).toBe(true);

        // Hash should match the verifier
        expect(session.matchesVerifier(verifier)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 5: Authentication Round-Trip
// Validates: Requirements 2.1, 2.2
// ============================================================================

describe('Property 5: Authentication Round-Trip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('authenticates with correct credentials and rejects incorrect ones', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArb,
        validPasswordArb,
        validPasswordArb,
        async (email, correctPassword, wrongPassword) => {
          // Ensure passwords are different
          fc.pre(correctPassword !== wrongPassword);

          const { fortress, repository } = createTestFortress();
          const user = User.rehydrate({
            id: 'user-1',
            email: email.toLowerCase(),
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            lockedUntil: null,
          });
          const passwordHash = await hashPassword(correctPassword);
          const account = Account.createEmailAccount(user.id, email, passwordHash);

          vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
          vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);

          // Correct password succeeds
          const correctResult = await fortress.signIn({ email, password: correctPassword });
          expect(correctResult.success).toBe(true);

          // Wrong password fails
          const wrongResult = await fortress.signIn({ email, password: wrongPassword });
          expect(wrongResult.success).toBe(false);
          if (!wrongResult.success) {
            expect(wrongResult.error).toBe('INVALID_CREDENTIALS');
          }
        },
      ),
      { numRuns: 25 },
    );
  }, 120000);
});

// ============================================================================
// Property 6: Account Lockout Enforcement
// Validates: Requirements 2.4, 7.2, 7.3
// ============================================================================

describe('Property 6: Account Lockout Enforcement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns ACCOUNT_LOCKED for any locked account without verifying password', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress();
        const lockedUntil = new Date(Date.now() + 3600000); // Locked for 1 hour
        const user = User.rehydrate({
          id: 'user-locked',
          email: email.toLowerCase(),
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lockedUntil,
        });

        vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
        // Password verification should NOT be called for locked accounts
        vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(null);

        const result = await fortress.signIn({ email, password });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('ACCOUNT_LOCKED');
        }
        // Account lookup should not have been called (password not verified)
        expect(repository.findEmailAccountByUserId).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  }, 30000);

  it('allows login when lockout has expired', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress();
        const expiredLock = new Date(Date.now() - 1000); // Lock expired 1 second ago
        const user = User.rehydrate({
          id: 'user-unlocked',
          email: email.toLowerCase(),
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lockedUntil: expiredLock,
        });
        const passwordHash = await hashPassword(password);
        const account = Account.createEmailAccount(user.id, email, passwordHash);

        vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
        vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);

        const result = await fortress.signIn({ email, password });

        expect(result.success).toBe(true);
      }),
      { numRuns: 25 },
    );
  }, 120000);
});

// ============================================================================
// Property 7: Email Verification Requirement
// Validates: Requirements 2.5
// ============================================================================

describe('Property 7: Email Verification Requirement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns EMAIL_NOT_VERIFIED for any unverified user with valid credentials', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress();
        const user = User.rehydrate({
          id: 'user-unverified',
          email: email.toLowerCase(),
          emailVerified: false, // Not verified
          createdAt: new Date(),
          updatedAt: new Date(),
          lockedUntil: null,
        });
        const passwordHash = await hashPassword(password);
        const account = Account.createEmailAccount(user.id, email, passwordHash);

        vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
        vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);

        const result = await fortress.signIn({ email, password });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('EMAIL_NOT_VERIFIED');
        }
      }),
      { numRuns: 50 },
    );
  }, 120000);
});

// ============================================================================
// Property 8: Login Attempt Recording
// Validates: Requirements 2.6
// ============================================================================

describe('Property 8: Login Attempt Recording', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records login attempt for any signIn call (success or failure)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArb,
        validPasswordArb,
        fc.boolean(),
        async (email, password, userExists) => {
          const { fortress, repository } = createTestFortress();

          if (userExists) {
            const user = User.rehydrate({
              id: 'user-1',
              email: email.toLowerCase(),
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              lockedUntil: null,
            });
            const passwordHash = await hashPassword(password);
            const account = Account.createEmailAccount(user.id, email, passwordHash);
            vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
            vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);
          } else {
            vi.mocked(repository.findUserByEmail).mockResolvedValue(null);
          }

          await fortress.signIn({ email, password, ipAddress: '127.0.0.1' });

          // Login attempt should always be recorded
          expect(repository.recordLoginAttempt).toHaveBeenCalled();
        },
      ),
      { numRuns: 50 },
    );
  }, 120000);
});

// ============================================================================
// Property 9: Session Expiration
// Validates: Requirements 3.4
// ============================================================================

describe('Property 9: Session Expiration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns SESSION_EXPIRED and deletes session for any expired session', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (userId) => {
        const { fortress, repository } = createTestFortress();
        // Create an expired session
        const { session, rawToken } = Session.create(userId, -1000); // Expired

        vi.mocked(repository.findSessionBySelector).mockResolvedValue(session);

        const result = await fortress.validateSession(rawToken);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('SESSION_EXPIRED');
        }
        expect(repository.deleteSession).toHaveBeenCalledWith(session.id);
      }),
      { numRuns: 100 },
    );
  }, 30000);
});

// ============================================================================
// Property 10: Session Deletion on Signout
// Validates: Requirements 3.5
// ============================================================================

describe('Property 10: Session Deletion on Signout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes session and invalidates token for any valid signOut', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (userId) => {
        const { fortress, repository } = createTestFortress();
        const { session, rawToken } = Session.create(userId, 3600000);

        vi.mocked(repository.findSessionBySelector).mockResolvedValue(session);

        const result = await fortress.signOut(rawToken);

        expect(result.success).toBe(true);
        expect(repository.deleteSession).toHaveBeenCalledWith(session.id);

        // Subsequent validation should fail
        vi.mocked(repository.findSessionBySelector).mockResolvedValue(null);
        const validateResult = await fortress.validateSession(rawToken);
        expect(validateResult.success).toBe(false);
        if (!validateResult.success) {
          expect(validateResult.error).toBe('SESSION_INVALID');
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);
});

// ============================================================================
// Property 11: Email Verification Round-Trip
// Validates: Requirements 4.3
// ============================================================================

describe('Property 11: Email Verification Round-Trip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks user as verified and deletes token for any valid verification', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, async (email) => {
        const { fortress, repository } = createTestFortress();
        const user = User.create(email);
        const { token, rawToken } = EmailVerificationToken.create(user.id, 3600000);

        vi.mocked(repository.findEmailVerificationBySelector).mockResolvedValue(token);
        vi.mocked(repository.findUserById).mockResolvedValue(user);

        const result = await fortress.verifyEmail(rawToken);

        expect(result.success).toBe(true);
        expect(repository.updateUser).toHaveBeenCalled();
        expect(repository.deleteEmailVerification).toHaveBeenCalledWith(token.id);

        // Verify the user was updated with emailVerified = true
        const updatedUser = vi.mocked(repository.updateUser).mock.calls[0]?.[0] as User;
        expect(updatedUser.emailVerified).toBe(true);
      }),
      { numRuns: 50 },
    );
  }, 30000);
});

// ============================================================================
// Property 12: Token Expiration Handling
// Validates: Requirements 4.4, 5.6
// ============================================================================

describe('Property 12: Token Expiration Handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns EMAIL_VERIFICATION_EXPIRED for any expired email verification token', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, async (email) => {
        const { fortress, repository } = createTestFortress();
        const user = User.create(email);
        const { token, rawToken } = EmailVerificationToken.create(user.id, -1000); // Expired

        vi.mocked(repository.findEmailVerificationBySelector).mockResolvedValue(token);

        const result = await fortress.verifyEmail(rawToken);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('EMAIL_VERIFICATION_EXPIRED');
        }
      }),
      { numRuns: 50 },
    );
  }, 30000);
});

// ============================================================================
// Property 13: Invalid Token Rejection
// Validates: Requirements 4.5
// ============================================================================

describe('Property 13: Invalid Token Rejection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns EMAIL_VERIFICATION_INVALID for any malformed token', async () => {
    const malformedTokenArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes(':')),
      fc.constant(''),
      fc.constant('invalid'),
      fc.constant('too:many:colons'),
    );

    await fc.assert(
      fc.asyncProperty(malformedTokenArb, async (token) => {
        const { fortress } = createTestFortress();

        const result = await fortress.verifyEmail(token);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('EMAIL_VERIFICATION_INVALID');
        }
      }),
      { numRuns: 50 },
    );
  }, 30000);

  it('returns EMAIL_VERIFICATION_INVALID for any non-existent token', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, async (email) => {
        const { fortress, repository } = createTestFortress();
        const user = User.create(email);
        const { rawToken } = EmailVerificationToken.create(user.id, 3600000);

        vi.mocked(repository.findEmailVerificationBySelector).mockResolvedValue(null);

        const result = await fortress.verifyEmail(rawToken);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('EMAIL_VERIFICATION_INVALID');
        }
      }),
      { numRuns: 50 },
    );
  }, 30000);
});

// ============================================================================
// Property 17: Account Lockout Lifecycle
// Validates: Requirements 7.1, 7.3, 7.4
// ============================================================================

describe('Property 17: Account Lockout Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('locks account after maxFailedAttempts within time window', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, correctPassword) => {
        const { fortress, repository } = createTestFortress({
          lockout: {
            enabled: true,
            maxFailedAttempts: 3,
            lockoutDurationMs: 15 * 60 * 1000,
          },
        });

        const user = User.rehydrate({
          id: 'user-1',
          email: email.toLowerCase(),
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lockedUntil: null,
        });
        const passwordHash = await hashPassword(correctPassword);
        const account = Account.createEmailAccount(user.id, email, passwordHash);

        vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
        vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);
        // Simulate 2 previous failed attempts
        vi.mocked(repository.countRecentFailedAttempts).mockResolvedValue(2);

        // Third failed attempt should trigger lockout
        const result = await fortress.signIn({ email, password: 'wrong-password' });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('INVALID_CREDENTIALS');
        }
        // User should have been updated with lock
        expect(repository.updateUser).toHaveBeenCalled();
        const lockedUser = vi.mocked(repository.updateUser).mock.calls[0]?.[0] as User;
        expect(lockedUser.lockedUntil).not.toBeNull();
      }),
      { numRuns: 25 },
    );
  }, 120000);

  it('allows login after lockout duration expires', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress({
          lockout: {
            enabled: true,
            maxFailedAttempts: 3,
            lockoutDurationMs: 15 * 60 * 1000,
          },
        });

        // User was locked but lock has expired
        const expiredLock = new Date(Date.now() - 1000);
        const user = User.rehydrate({
          id: 'user-1',
          email: email.toLowerCase(),
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lockedUntil: expiredLock,
        });
        const passwordHash = await hashPassword(password);
        const account = Account.createEmailAccount(user.id, email, passwordHash);

        vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
        vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);

        const result = await fortress.signIn({ email, password });

        expect(result.success).toBe(true);
      }),
      { numRuns: 25 },
    );
  }, 120000);
});

// ============================================================================
// Property 18: Token Entropy
// Validates: Requirements 12.2
// ============================================================================

describe('Property 18: Token Entropy', () => {
  it('generates unique selectors and verifiers for any number of tokens', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 100 }), (count) => {
        const selectors = new Set<string>();
        const verifiers = new Set<string>();

        for (let i = 0; i < count; i++) {
          const { rawToken } = Session.create(`user-${i}`, 3600000);
          const [selector, verifier] = rawToken.split(':');

          // Each selector and verifier should be unique
          expect(selectors.has(selector)).toBe(false);
          expect(verifiers.has(verifier)).toBe(false);

          selectors.add(selector);
          verifiers.add(verifier);
        }

        // All tokens should be unique
        expect(selectors.size).toBe(count);
        expect(verifiers.size).toBe(count);
      }),
      { numRuns: 50 },
    );
  });

  it('generates tokens with correct byte lengths', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.integer({ min: 1000, max: 86400000 }), (userId, ttlMs) => {
        const { rawToken } = Session.create(userId, ttlMs);
        const [selector, verifier] = rawToken.split(':');

        // Selector: 16 bytes = 32 hex chars
        expect(selector).toHaveLength(32);
        // Verifier: 32 bytes = 64 hex chars
        expect(verifier).toHaveLength(64);

        // Both should be valid hex
        expect(/^[0-9a-f]+$/.test(selector)).toBe(true);
        expect(/^[0-9a-f]+$/.test(verifier)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('generates tokens with sufficient randomness (no patterns)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 50, max: 100 }), (count) => {
        const tokens: string[] = [];

        for (let i = 0; i < count; i++) {
          const { rawToken } = Session.create(`user-${i}`, 3600000);
          tokens.push(rawToken);
        }

        // Check that tokens don't share common prefixes (beyond chance)
        const prefixes = tokens.map((t) => t.slice(0, 8));
        const uniquePrefixes = new Set(prefixes);

        // With random tokens, we expect most prefixes to be unique
        // Allow some collision but not too many
        expect(uniquePrefixes.size).toBeGreaterThan(count * 0.9);
      }),
      { numRuns: 20 },
    );
  });
});

// ============================================================================
// Property 19: No Sensitive Data in Responses
// Validates: Requirements 12.5
// ============================================================================

describe('Property 19: No Sensitive Data in Responses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never exposes password hashes in successful signUp response', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validPasswordArb, async (email, password) => {
        const { fortress, repository } = createTestFortress();
        vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

        const result = await fortress.signUp({ email, password });

        if (result.success) {
          const responseStr = JSON.stringify(result.data);
          // Should not contain password hash patterns
          expect(responseStr).not.toMatch(/\$argon2/);
          expect(responseStr).not.toMatch(/\$2[aby]\$/); // bcrypt
          expect(responseStr).not.toMatch(/passwordHash/i);
        }
      }),
      { numRuns: 50 },
    );
  }, 60000);

  it('never exposes raw verifiers in session validation response', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, async (email) => {
        const { fortress, repository } = createTestFortress();
        const user = User.rehydrate({
          id: 'user-1',
          email: email.toLowerCase(),
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lockedUntil: null,
        });
        const { session, rawToken } = Session.create(user.id, 3600000);
        const [, verifier] = rawToken.split(':');

        vi.mocked(repository.findSessionBySelector).mockResolvedValue(session);
        vi.mocked(repository.findUserById).mockResolvedValue(user);

        const result = await fortress.validateSession(rawToken);

        if (result.success) {
          const responseStr = JSON.stringify(result.data);
          // Should not contain raw verifier (the secret part of the token)
          expect(responseStr).not.toContain(verifier);
          // Note: verifierHash is stored in session and may be returned,
          // but it's a one-way hash and cannot be reversed to get the verifier
          // The important thing is the raw verifier is never exposed
        }
      }),
      { numRuns: 50 },
    );
  }, 30000);

  it('user toJSON never exposes sensitive internal data', () => {
    fc.assert(
      fc.property(validEmailArb, (email) => {
        const user = User.create(email);
        const json = user.toJSON();
        const jsonStr = JSON.stringify(json);

        // Should not contain password-related fields
        expect(jsonStr).not.toMatch(/password/i);
        expect(jsonStr).not.toMatch(/hash/i);
        expect(jsonStr).not.toMatch(/secret/i);
        expect(jsonStr).not.toMatch(/token/i);
      }),
      { numRuns: 100 },
    );
  });
});
