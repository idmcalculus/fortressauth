import { Account } from './domain/entities/account.js';
import { LoginAttempt } from './domain/entities/login-attempt.js';
import { Session } from './domain/entities/session.js';
import { User } from './domain/entities/user.js';
import type { AuthRepository } from './ports/auth-repository.js';
import type { RateLimiterPort } from './ports/rate-limiter.js';
import type { FortressConfig, FortressConfigInput } from './schemas/config.js';
import { FortressConfigSchema } from './schemas/config.js';
import { hashPassword, verifyPassword } from './security/password.js';
import { validatePassword } from './security/validation.js';
import type { AuthErrorCode } from './types/errors.js';
import type { Result } from './types/result.js';
import { err, ok } from './types/result.js';

export interface SignUpInput {
  email: string;
  password: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface SignInInput {
  email: string;
  password: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface AuthResult {
  user: User;
  token: string;
}

export class FortressAuth {
  private readonly config: FortressConfig;

  constructor(
    private readonly repository: AuthRepository,
    private readonly rateLimiter: RateLimiterPort,
    config?: FortressConfigInput,
  ) {
    this.config = FortressConfigSchema.parse(config ?? {});
  }

  // Expose a read-only copy of the effective config for hosts (e.g. HTTP server)
  getConfig(): Readonly<FortressConfig> {
    return this.config;
  }

  async signUp(input: SignUpInput): Promise<Result<AuthResult, AuthErrorCode>> {
    const email = input.email.toLowerCase();

    if (this.config.rateLimit.enabled) {
      const rateCheck = await this.rateLimiter.check(email, 'login');
      if (!rateCheck.allowed) {
        return err('RATE_LIMIT_EXCEEDED');
      }
    }

    const validation = validatePassword(input.password, {
      minLength: this.config.password.minLength,
      maxLength: this.config.password.maxLength,
    });

    if (!validation.valid) {
      return err('PASSWORD_TOO_WEAK');
    }

    const existingUser = await this.repository.findUserByEmail(email);
    if (existingUser) {
      return err('EMAIL_EXISTS');
    }

    const passwordHash = await hashPassword(input.password);
    const user = User.create(email);
    const account = Account.createEmailAccount(user.id, email, passwordHash);

    const result = await this.repository.transaction(async (repo) => {
      const createUserResult = await repo.createUser(user);
      if (!createUserResult.success) {
        return err(createUserResult.error);
      }

      await repo.createAccount(account);

      const { session, rawToken } = Session.create(
        user.id,
        this.config.session.ttlMs,
        input.ipAddress,
        input.userAgent,
      );
      await repo.createSession(session);

      return ok({ user, token: rawToken });
    });

    if (result.success && this.config.rateLimit.enabled) {
      await this.rateLimiter.consume(email, 'login');
    }

    return result;
  }

  async signIn(input: SignInInput): Promise<Result<AuthResult, AuthErrorCode>> {
    const email = input.email.toLowerCase();
    const ipAddress = input.ipAddress ?? 'unknown';

    // Check rate limit first and consume a token for every attempt (prevents brute force)
    if (this.config.rateLimit.enabled) {
      const rateCheck = await this.rateLimiter.check(email, 'login');
      if (!rateCheck.allowed) {
        await this.repository.recordLoginAttempt(LoginAttempt.create(email, ipAddress, false));
        return err('RATE_LIMIT_EXCEEDED');
      }
      // Consume token for every login attempt, not just successful ones
      await this.rateLimiter.consume(email, 'login');
    }

    const user = await this.repository.findUserByEmail(email);

    if (!user) {
      // Perform dummy hash to prevent timing attacks
      await hashPassword('dummy-password-to-prevent-timing-attack');
      await this.repository.recordLoginAttempt(LoginAttempt.create(email, ipAddress, false));
      return err('INVALID_CREDENTIALS');
    }

    // Check lockout BEFORE password verification to prevent password oracle attacks
    if (user.isLocked()) {
      await this.repository.recordLoginAttempt(
        LoginAttempt.create(email, ipAddress, false, user.id),
      );
      return err('ACCOUNT_LOCKED');
    }

    const account = await this.repository.findEmailAccountByUserId(user.id);
    if (!account || !account.passwordHash) {
      await this.repository.recordLoginAttempt(
        LoginAttempt.create(email, ipAddress, false, user.id),
      );
      return err('INVALID_CREDENTIALS');
    }

    // Argon2 verification is already timing-safe internally
    const isValidPassword = await verifyPassword(account.passwordHash, input.password);

    if (!isValidPassword) {
      await this.repository.recordLoginAttempt(
        LoginAttempt.create(email, ipAddress, false, user.id),
      );

      if (this.config.lockout.enabled) {
        const failedAttempts = await this.repository.countRecentFailedAttempts(
          email,
          this.config.lockout.lockoutDurationMs,
        );

        if (failedAttempts + 1 >= this.config.lockout.maxFailedAttempts) {
          const lockedUntil = new Date(Date.now() + this.config.lockout.lockoutDurationMs);
          const lockedUser = user.withLock(lockedUntil);
          await this.repository.updateUser(lockedUser);
        }
      }

      return err('INVALID_CREDENTIALS');
    }

    const { session, rawToken } = Session.create(
      user.id,
      this.config.session.ttlMs,
      input.ipAddress,
      input.userAgent,
    );

    await this.repository.createSession(session);
    await this.repository.recordLoginAttempt(LoginAttempt.create(email, ipAddress, true, user.id));

    return ok({ user, token: rawToken });
  }

  async validateSession(
    rawToken: string,
  ): Promise<Result<{ user: User; session: Session }, AuthErrorCode>> {
    const tokenHash = Session.hashToken(rawToken);
    const session = await this.repository.findSessionByTokenHash(tokenHash);

    if (!session) {
      return err('SESSION_INVALID');
    }

    if (session.isExpired()) {
      await this.repository.deleteSession(session.id);
      return err('SESSION_EXPIRED');
    }

    const user = await this.repository.findUserById(session.userId);
    if (!user) {
      await this.repository.deleteSession(session.id);
      return err('SESSION_INVALID');
    }

    return ok({ user, session });
  }

  async signOut(rawToken: string): Promise<Result<void, AuthErrorCode>> {
    const tokenHash = Session.hashToken(rawToken);
    const session = await this.repository.findSessionByTokenHash(tokenHash);

    if (!session) {
      return err('SESSION_INVALID');
    }

    await this.repository.deleteSession(session.id);
    return ok(undefined);
  }
}
