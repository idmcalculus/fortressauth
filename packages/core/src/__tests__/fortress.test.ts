import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../domain/entities/account.js';
import { EmailVerificationToken } from '../domain/entities/email-verification-token.js';
import { PasswordResetToken } from '../domain/entities/password-reset-token.js';
import { Session } from '../domain/entities/session.js';
import { User } from '../domain/entities/user.js';
import { FortressAuth } from '../fortress.js';
import type { AuthRepository } from '../ports/auth-repository.js';
import type { EmailProviderPort } from '../ports/email-provider.js';
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

function createMockEmailProvider(): EmailProviderPort {
  return {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  };
}

describe('FortressAuth', () => {
  let repository: AuthRepository;
  let rateLimiter: RateLimiterPort;
  let emailProvider: EmailProviderPort;
  let fortress: FortressAuth;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
    repository = createMockRepository();
    rateLimiter = createMockRateLimiter();
    emailProvider = createMockEmailProvider();
    fortress = new FortressAuth(repository, rateLimiter, emailProvider, {
      urls: { baseUrl: 'http://localhost:3000' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('signUp()', () => {
    it('should create a new user and send verification email', async () => {
      vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

      const result = await fortress.signUp({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(true);
      expect(emailProvider.sendVerificationEmail).toHaveBeenCalled();
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

    it('should fail if password is too weak', async () => {
      const result = await fortress.signUp({
        email: 'test@example.com',
        password: 'weak',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PASSWORD_TOO_WEAK');
      }
    });
  });

  describe('signIn()', () => {
    it('should sign in when credentials and verification are valid', async () => {
      const user = User.rehydrate({
        id: 'user-1',
        email: 'test@example.com',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lockedUntil: null,
      });
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
      }
    });

    it('should block when email not verified', async () => {
      const user = User.create('test@example.com');
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
        expect(result.error).toBe('EMAIL_NOT_VERIFIED');
      }
    });

    it('should fail if account not found for user', async () => {
      const user = User.create('test@example.com');
      vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
      vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(null);

      const result = await fortress.signIn({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should fail if rate limit exceeded', async () => {
      vi.mocked(rateLimiter.check).mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(),
        retryAfterMs: 1000,
      });

      const result = await fortress.signIn({
        email: 'test@example.com',
        password: 'password',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('RATE_LIMIT_EXCEEDED');
      }
    });
  });

  describe('validateSession()', () => {
    it('should validate a correct session token', async () => {
      const user = User.create('test@example.com');
      const { session, rawToken } = Session.create(user.id, 3600000);
      vi.mocked(repository.findSessionBySelector).mockResolvedValue(session);
      vi.mocked(repository.findUserById).mockResolvedValue(user);

      const result = await fortress.validateSession(rawToken);

      expect(result.success).toBe(true);
    });

    it('should reject invalid token format', async () => {
      const result = await fortress.validateSession('invalid');
      expect(result.success).toBe(false);
    });

    it('should return session invalid if user not found', async () => {
      const user = User.create('test@example.com');
      const { session, rawToken } = Session.create(user.id, 3600000);
      vi.mocked(repository.findSessionBySelector).mockResolvedValue(session);
      vi.mocked(repository.findUserById).mockResolvedValue(null);

      const result = await fortress.validateSession(rawToken);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('SESSION_INVALID');
      }
    });

    it('should return session expired if expired', async () => {
      const user = User.create('test@example.com');
      const { session, rawToken } = Session.create(user.id, -1000); // Expired
      vi.mocked(repository.findSessionBySelector).mockResolvedValue(session);

      const result = await fortress.validateSession(rawToken);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('SESSION_EXPIRED');
      }
    });

    it('should return session invalid if verifier mismatch', async () => {
      const user = User.create('test@example.com');
      const { session } = Session.create(user.id, 3600000);
      const wrongToken = `${session.selector}:wrongVerifier`;

      vi.mocked(repository.findSessionBySelector).mockResolvedValue(session);

      const result = await fortress.validateSession(wrongToken);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('SESSION_INVALID');
      }
    });
  });

  describe('signOut()', () => {
    it('should delete existing session', async () => {
      const { session, rawToken } = Session.create('user-123', 3600000);
      vi.mocked(repository.findSessionBySelector).mockResolvedValue(session);

      const result = await fortress.signOut(rawToken);

      expect(result.success).toBe(true);
      expect(repository.deleteSession).toHaveBeenCalledWith(session.id);
    });
  });

  describe('verifyEmail()', () => {
    it('verifies email with valid token', async () => {
      const user = User.create('test@example.com');
      const { token, rawToken } = EmailVerificationToken.create(user.id, 3600000);
      vi.mocked(repository.findEmailVerificationBySelector).mockResolvedValue(token);
      vi.mocked(repository.findUserById).mockResolvedValue(user);

      const result = await fortress.verifyEmail(rawToken);

      expect(result.success).toBe(true);
      expect(repository.updateUser).toHaveBeenCalled();
      expect(repository.updateUser).toHaveBeenCalled();
      expect(repository.deleteEmailVerification).toHaveBeenCalled();
    });

    it('should fail if email token is expired', async () => {
      const user = User.create('test@example.com');
      const { token, rawToken } = EmailVerificationToken.create(user.id, -1000); // Expired

      vi.mocked(repository.findEmailVerificationBySelector).mockResolvedValue(token);

      const result = await fortress.verifyEmail(rawToken);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('EMAIL_VERIFICATION_EXPIRED');
      }
    });

    it('should fail if email token verifier mismatch', async () => {
      const user = User.create('test@example.com');
      const { token } = EmailVerificationToken.create(user.id, 3600000);
      const wrongToken = `${token.selector}:wrongVerifier`;

      vi.mocked(repository.findEmailVerificationBySelector).mockResolvedValue(token);

      const result = await fortress.verifyEmail(wrongToken);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('EMAIL_VERIFICATION_INVALID');
      }
    });

    it('should fail if token format is invalid', async () => {
      const result = await fortress.verifyEmail('invalid-format');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('EMAIL_VERIFICATION_INVALID');
      }
    });

    it('should fail if token not found', async () => {
      const user = User.create('test@example.com');
      const { rawToken } = EmailVerificationToken.create(user.id, 3600000);

      vi.mocked(repository.findEmailVerificationBySelector).mockResolvedValue(null);

      const result = await fortress.verifyEmail(rawToken);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('EMAIL_VERIFICATION_INVALID');
      }
    });

    it('should fail if user not found during verification', async () => {
      const user = User.create('test@example.com');
      const { token, rawToken } = EmailVerificationToken.create(user.id, 3600000);

      vi.mocked(repository.findEmailVerificationBySelector).mockResolvedValue(token);
      vi.mocked(repository.findUserById).mockResolvedValue(null);

      const result = await fortress.verifyEmail(rawToken);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('EMAIL_VERIFICATION_INVALID');
      }
    });
  });

  describe('requestPasswordReset()', () => {
    it('creates token and sends email when user exists', async () => {
      const user = User.create('test@example.com');
      vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
      vi.mocked(repository.findPasswordResetsByUserId).mockResolvedValue([]);

      const result = await fortress.requestPasswordReset('test@example.com');

      expect(result.success).toBe(true);
      expect(repository.createPasswordResetToken).toHaveBeenCalled();
      expect(emailProvider.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('should return success but do nothing if user does not exist', async () => {
      vi.mocked(repository.findUserByEmail).mockResolvedValue(null);

      const result = await fortress.requestPasswordReset('nonexistent@example.com');

      expect(result.success).toBe(true);
      expect(repository.createPasswordResetToken).not.toHaveBeenCalled();
      expect(emailProvider.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('deletes oldest tokens when max active limit is exceeded', async () => {
      const user = User.create('test@example.com');
      vi.mocked(repository.findUserByEmail).mockResolvedValue(user);

      vi.setSystemTime(new Date('2024-01-15T09:00:00.000Z'));
      const { token: oldest } = PasswordResetToken.create(user.id, 3600000);
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
      const { token: middle } = PasswordResetToken.create(user.id, 3600000);
      vi.setSystemTime(new Date('2024-01-15T11:00:00.000Z'));
      const { token: newest } = PasswordResetToken.create(user.id, 3600000);

      vi.mocked(repository.findPasswordResetsByUserId).mockResolvedValue([oldest, middle, newest]);

      fortress = new FortressAuth(repository, rateLimiter, emailProvider, {
        urls: { baseUrl: 'http://localhost:3000' },
        passwordReset: { maxActiveTokens: 2 },
      });

      const result = await fortress.requestPasswordReset('test@example.com');

      expect(result.success).toBe(true);
      expect(repository.deletePasswordReset).toHaveBeenCalledWith(oldest.id);
    });
  });

  describe('resetPassword()', () => {
    it('should reject invalid token format', async () => {
      const result = await fortress.resetPassword({
        token: 'invalid-format',
        newPassword: 'NewPassword123!',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PASSWORD_RESET_INVALID');
      }
    });

    it('should fail if token not found', async () => {
      const user = User.create('test@example.com');
      const { rawToken } = PasswordResetToken.create(user.id, 3600000);

      vi.mocked(repository.findPasswordResetBySelector).mockResolvedValue(null); // Not found

      const result = await fortress.resetPassword({
        token: rawToken,
        newPassword: 'NewPassword123!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PASSWORD_RESET_INVALID');
      }
    });
    it('resets password with valid token', async () => {
      const user = User.create('test@example.com');
      const { token, rawToken } = PasswordResetToken.create(user.id, 3600000);
      const account = Account.createEmailAccount(user.id, 'test@example.com', 'old-hash');

      vi.mocked(repository.findPasswordResetBySelector).mockResolvedValue(token);
      vi.mocked(repository.findUserById).mockResolvedValue(user);
      vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(account);

      const result = await fortress.resetPassword({
        token: rawToken,
        newPassword: 'NewPassword123!',
      });

      expect(result.success).toBe(true);
      expect(repository.updateEmailAccountPassword).toHaveBeenCalled();
      expect(repository.deleteSessionsByUserId).toHaveBeenCalledWith(user.id);
    });

    it('should fail if account not found', async () => {
      const user = User.create('test@example.com');
      const { token, rawToken } = PasswordResetToken.create(user.id, 3600000);

      vi.mocked(repository.findPasswordResetBySelector).mockResolvedValue(token);
      vi.mocked(repository.findUserById).mockResolvedValue(user);
      vi.mocked(repository.findEmailAccountByUserId).mockResolvedValue(null);

      const result = await fortress.resetPassword({
        token: rawToken,
        newPassword: 'NewPassword123!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PASSWORD_RESET_INVALID');
      }
    });

    it('should fail if user not found during reset', async () => {
      const user = User.create('test@example.com');
      const { token, rawToken } = PasswordResetToken.create(user.id, 3600000);

      vi.mocked(repository.findPasswordResetBySelector).mockResolvedValue(token);
      vi.mocked(repository.findUserById).mockResolvedValue(null);

      const result = await fortress.resetPassword({
        token: rawToken,
        newPassword: 'NewPassword123!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PASSWORD_RESET_INVALID');
      }
    });

    it('should fail if new password is too weak', async () => {
      const user = User.create('test@example.com');
      const { token, rawToken } = PasswordResetToken.create(user.id, 3600000);

      vi.mocked(repository.findPasswordResetBySelector).mockResolvedValue(token);
      vi.mocked(repository.findUserById).mockResolvedValue(user);

      const result = await fortress.resetPassword({
        token: rawToken,
        newPassword: 'weak',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PASSWORD_TOO_WEAK');
      }
      expect(repository.deletePasswordReset).toHaveBeenCalledWith(token.id);
    });

    it('should fail if token is expired', async () => {
      const user = User.create('test@example.com');
      const { token, rawToken } = PasswordResetToken.create(user.id, -1000); // Expired

      vi.mocked(repository.findPasswordResetBySelector).mockResolvedValue(token);

      const result = await fortress.resetPassword({
        token: rawToken,
        newPassword: 'NewPassword123!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PASSWORD_RESET_EXPIRED');
      }
    });

    it('should fail if token verifier does not match', async () => {
      const user = User.create('test@example.com');
      const { token } = PasswordResetToken.create(user.id, 3600000);

      vi.mocked(repository.findPasswordResetBySelector).mockResolvedValue(token);

      // Construct a token with the SAME selector but DIFFERENT verifier
      const wrongVerifier = 'wrong-verifier';
      const wrongToken = `${token.selector}:${wrongVerifier}`;

      const result = await fortress.resetPassword({
        token: wrongToken,
        newPassword: 'NewPassword123!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('PASSWORD_RESET_INVALID');
      }
    });
  });

  describe('getConfig()', () => {
    it('should return configuration', () => {
      const config = fortress.getConfig();
      expect(config.urls.baseUrl).toBe('http://localhost:3000');
    });
  });
});
