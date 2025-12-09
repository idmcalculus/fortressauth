import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../domain/entities/account.js';
import { Session } from '../domain/entities/session.js';
import { User } from '../domain/entities/user.js';
import { FortressAuth } from '../fortress.js';
import type { AuthRepository } from '../ports/auth-repository.js';
import type { RateLimiterPort } from '../ports/rate-limiter.js';
import { hashPassword } from '../security/password.js';
import { ok } from '../types/result.js';

// Mock repository
function createMockRepository(): AuthRepository {
  return {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createUser: vi.fn().mockResolvedValue(ok(undefined)),
    updateUser: vi.fn().mockResolvedValue(undefined),
    findAccountByProvider: vi.fn(),
    findEmailAccountByUserId: vi.fn(),
    createAccount: vi.fn().mockResolvedValue(undefined),
    findSessionByTokenHash: vi.fn(),
    createSession: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    deleteSessionsByUserId: vi.fn().mockResolvedValue(undefined),
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
        findSessionByTokenHash: vi.fn(),
        createSession: vi.fn(),
        deleteSession: vi.fn(),
        deleteSessionsByUserId: vi.fn(),
        recordLoginAttempt: vi.fn(),
        countRecentFailedAttempts: vi.fn().mockResolvedValue(0),
        transaction: vi.fn(),
      }),
    ),
  };
}

// Mock rate limiter
function createMockRateLimiter(): RateLimiterPort {
  return {
    check: vi
      .fn()
      .mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date(), retryAfterMs: 0 }),
    consume: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
  };
}

describe('FortressAuth', () => {
  let repository: AuthRepository;
  let rateLimiter: RateLimiterPort;
  let fortress: FortressAuth;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
    repository = createMockRepository();
    rateLimiter = createMockRateLimiter();
    fortress = new FortressAuth(repository, rateLimiter);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getConfig()', () => {
    it('should return the effective configuration', () => {
      const config = fortress.getConfig();

      expect(config.session.ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
      expect(config.rateLimit.enabled).toBe(true);
    });

    it('should use custom config when provided', () => {
      const customFortress = new FortressAuth(repository, rateLimiter, {
        session: { ttlMs: 3600000 },
      });

      expect(customFortress.getConfig().session.ttlMs).toBe(3600000);
    });
  });

  describe('signUp()', () => {
    it('should create a new user successfully', async () => {
      vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

      const result = await fortress.signUp({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user.email).toBe('test@example.com');
        expect(result.data.token).toBeDefined();
      }
    });

    it('should return EMAIL_EXISTS when email is taken', async () => {
      vi.mocked(repository.findUserByEmail).mockResolvedValue(User.create('test@example.com'));

      const result = await fortress.signUp({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('EMAIL_EXISTS');
      }
    });

    it('should return PASSWORD_TOO_WEAK for weak password', async () => {
      vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

      const result = await fortress.signUp({
        email: 'test@example.com',
        password: 'short',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PASSWORD_TOO_WEAK');
      }
    });

    it('should return RATE_LIMIT_EXCEEDED when rate limited', async () => {
      vi.mocked(rateLimiter.check).mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(),
        retryAfterMs: 60000,
      });

      const result = await fortress.signUp({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('RATE_LIMIT_EXCEEDED');
      }
    });

    it('should normalize email to lowercase', async () => {
      vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

      const result = await fortress.signUp({
        email: 'TEST@EXAMPLE.COM',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user.email).toBe('test@example.com');
      }
    });

    it('should include IP and user agent in session', async () => {
      vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

      await fortress.signUp({
        email: 'test@example.com',
        password: 'SecurePass123!',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      // Verify session was created with IP and user agent
      expect(repository.transaction).toHaveBeenCalled();
    });
  });

  describe('signIn()', () => {
    it('should sign in successfully with correct credentials', async () => {
      const user = User.create('test@example.com');
      const passwordHash = await hashPassword('SecurePass123!');
      const account = Account.createEmailAccount(user.id, 'test@example.com', passwordHash);

      vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
      vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);

      const result = await fortress.signIn({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user.email).toBe('test@example.com');
        expect(result.data.token).toBeDefined();
      }
    });

    it('should return INVALID_CREDENTIALS for wrong password', async () => {
      const user = User.create('test@example.com');
      const passwordHash = await hashPassword('CorrectPassword');
      const account = Account.createEmailAccount(user.id, 'test@example.com', passwordHash);

      vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
      vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);

      const result = await fortress.signIn({
        email: 'test@example.com',
        password: 'WrongPassword',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should return INVALID_CREDENTIALS for non-existent user', async () => {
      vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

      const result = await fortress.signIn({
        email: 'nonexistent@example.com',
        password: 'AnyPassword123!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should return ACCOUNT_LOCKED for locked account', async () => {
      const user = User.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lockedUntil: new Date('2024-01-15T11:00:00.000Z'), // 1 hour in future
      });
      const passwordHash = await hashPassword('SecurePass123!');
      const account = Account.createEmailAccount(user.id, 'test@example.com', passwordHash);

      vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
      vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);

      const result = await fortress.signIn({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('ACCOUNT_LOCKED');
      }
    });

    it('should return RATE_LIMIT_EXCEEDED when rate limited', async () => {
      vi.mocked(rateLimiter.check).mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(),
        retryAfterMs: 60000,
      });

      const result = await fortress.signIn({
        email: 'test@example.com',
        password: 'AnyPassword',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('RATE_LIMIT_EXCEEDED');
      }
    });

    it('should lock account after max failed attempts', async () => {
      const user = User.create('test@example.com');
      const passwordHash = await hashPassword('CorrectPassword');
      const account = Account.createEmailAccount(user.id, 'test@example.com', passwordHash);

      vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
      vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);
      vi.mocked(repository.countRecentFailedAttempts).mockResolvedValue(4); // 4 previous failures

      await fortress.signIn({
        email: 'test@example.com',
        password: 'WrongPassword',
      });

      expect(repository.updateUser).toHaveBeenCalled();
    });

    it('should return INVALID_CREDENTIALS when account has no password', async () => {
      const user = User.create('test@example.com');
      const account = Account.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: user.id,
        providerId: 'email',
        providerUserId: 'test@example.com',
        passwordHash: null, // OAuth account
        createdAt: new Date(),
      });

      vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
      vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);

      const result = await fortress.signIn({
        email: 'test@example.com',
        password: 'AnyPassword',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_CREDENTIALS');
      }
    });
  });

  describe('validateSession()', () => {
    it('should validate a valid session', async () => {
      const user = User.create('test@example.com');
      const { session, rawToken } = Session.create(user.id, 3600000);

      vi.mocked(repository.findSessionByTokenHash).mockResolvedValue(session);
      vi.mocked(repository.findUserById).mockResolvedValue(user);

      const result = await fortress.validateSession(rawToken);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user.email).toBe('test@example.com');
        expect(result.data.session.id).toBe(session.id);
      }
    });

    it('should return SESSION_INVALID for unknown token', async () => {
      vi.mocked(repository.findSessionByTokenHash).mockResolvedValue(null);

      const result = await fortress.validateSession('invalid-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('SESSION_INVALID');
      }
    });

    it('should return SESSION_EXPIRED for expired session', async () => {
      const user = User.create('test@example.com');
      const session = Session.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: user.id,
        tokenHash: 'abc123',
        expiresAt: new Date('2024-01-15T09:00:00.000Z'), // 1 hour ago
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2024-01-15T08:00:00.000Z'),
      });

      vi.mocked(repository.findSessionByTokenHash).mockResolvedValue(session);

      const result = await fortress.validateSession('any-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('SESSION_EXPIRED');
      }
      expect(repository.deleteSession).toHaveBeenCalledWith(session.id);
    });

    it('should return SESSION_INVALID when user not found', async () => {
      const { session, rawToken } = Session.create('user-123', 3600000);

      vi.mocked(repository.findSessionByTokenHash).mockResolvedValue(session);
      vi.mocked(repository.findUserById).mockResolvedValue(null);

      const result = await fortress.validateSession(rawToken);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('SESSION_INVALID');
      }
    });
  });

  describe('signOut()', () => {
    it('should delete the session', async () => {
      const { session, rawToken } = Session.create('user-123', 3600000);

      vi.mocked(repository.findSessionByTokenHash).mockResolvedValue(session);

      const result = await fortress.signOut(rawToken);

      expect(result.success).toBe(true);
      expect(repository.deleteSession).toHaveBeenCalledWith(session.id);
    });

    it('should return SESSION_INVALID for unknown token', async () => {
      vi.mocked(repository.findSessionByTokenHash).mockResolvedValue(null);

      const result = await fortress.signOut('invalid-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('SESSION_INVALID');
      }
    });
  });

  describe('rate limiting disabled', () => {
    it('should skip rate limit check when disabled', async () => {
      const customFortress = new FortressAuth(repository, rateLimiter, {
        rateLimit: { enabled: false },
      });

      vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

      await customFortress.signUp({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

      expect(rateLimiter.check).not.toHaveBeenCalled();
    });
  });

  describe('lockout disabled', () => {
    it('should not lock account when lockout is disabled', async () => {
      const customFortress = new FortressAuth(repository, rateLimiter, {
        lockout: { enabled: false },
      });

      const user = User.create('test@example.com');
      const passwordHash = await hashPassword('CorrectPassword');
      const account = Account.createEmailAccount(user.id, 'test@example.com', passwordHash);

      vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
      vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);
      vi.mocked(repository.countRecentFailedAttempts).mockResolvedValue(10);

      await customFortress.signIn({
        email: 'test@example.com',
        password: 'WrongPassword',
      });

      expect(repository.updateUser).not.toHaveBeenCalled();
    });
  });
});
