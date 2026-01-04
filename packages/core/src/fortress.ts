import { Account } from './domain/entities/account.js';
import { EmailVerificationToken } from './domain/entities/email-verification-token.js';
import { LoginAttempt } from './domain/entities/login-attempt.js';
import { PasswordResetToken } from './domain/entities/password-reset-token.js';
import { Session } from './domain/entities/session.js';
import { User } from './domain/entities/user.js';
import type { AuthRepository } from './ports/auth-repository.js';
import type { EmailProviderPort } from './ports/email-provider.js';
import type { RateLimiterPort } from './ports/rate-limiter.js';
import type { FortressConfig, FortressConfigInput } from './schemas/config.js';
import { FortressConfigSchema } from './schemas/config.js';
import { validateEmailInput, validatePasswordInput } from './security/input-validation.js';
import { hashPassword, verifyPassword } from './security/password.js';
import { buildRateLimitIdentifier } from './security/rate-limit-key.js';
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

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
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
    private readonly emailProvider: EmailProviderPort,
    config?: FortressConfigInput,
  ) {
    this.config = FortressConfigSchema.parse(config ?? {});
  }

  // Expose a read-only copy of the effective config for hosts (e.g. HTTP server)
  getConfig(): Readonly<FortressConfig> {
    return this.config;
  }

  async signUp(input: SignUpInput): Promise<Result<AuthResult, AuthErrorCode>> {
    const emailValidation = validateEmailInput(input.email);
    if (!emailValidation.success) {
      return err(emailValidation.error);
    }

    const passwordValidation = validatePasswordInput(
      input.password,
      this.config.password.maxLength,
    );
    if (!passwordValidation.success) {
      return err(passwordValidation.error);
    }

    const email = emailValidation.data;
    const rateLimitId = buildRateLimitIdentifier({
      email,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    if (this.config.rateLimit.enabled) {
      const rateCheck = await this.rateLimiter.check(rateLimitId, 'login');
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
    const { session, rawToken } = Session.create(
      user.id,
      this.config.session.ttlMs,
      input.ipAddress,
      input.userAgent,
    );
    const { token: verificationToken, rawToken: rawVerificationToken } =
      EmailVerificationToken.create(user.id, this.config.emailVerification.ttlMs);

    const result = await this.repository.transaction(async (repo) => {
      const createUserResult = await repo.createUser(user);
      if (!createUserResult.success) {
        return err(createUserResult.error);
      }

      await repo.createAccount(account);
      await repo.createSession(session);
      await repo.createEmailVerificationToken(verificationToken);

      return ok({ user, token: rawToken });
    });

    if (result.success && this.config.rateLimit.enabled) {
      await this.rateLimiter.consume(rateLimitId, 'login');
    }

    if (result.success) {
      const verificationLink = `${this.config.urls.baseUrl}/verify-email?token=${rawVerificationToken}`;
      await this.emailProvider.sendVerificationEmail(email, verificationLink);
    }

    return result;
  }

  async signIn(input: SignInInput): Promise<Result<AuthResult, AuthErrorCode>> {
    const emailValidation = validateEmailInput(input.email);
    if (!emailValidation.success) {
      return err(emailValidation.error);
    }

    const passwordValidation = validatePasswordInput(
      input.password,
      this.config.password.maxLength,
    );
    if (!passwordValidation.success) {
      return err(passwordValidation.error);
    }

    const email = emailValidation.data;
    const ipAddress = input.ipAddress ?? 'unknown';
    const rateLimitId = buildRateLimitIdentifier({
      email,
      ipAddress,
      userAgent: input.userAgent,
    });

    // Check rate limit first and consume a token for every attempt (prevents brute force)
    if (this.config.rateLimit.enabled) {
      const rateCheck = await this.rateLimiter.check(rateLimitId, 'login');
      if (!rateCheck.allowed) {
        await this.repository.recordLoginAttempt(LoginAttempt.create(email, ipAddress, false));
        return err('RATE_LIMIT_EXCEEDED');
      }
      // Consume token for every login attempt, not just successful ones
      await this.rateLimiter.consume(rateLimitId, 'login');
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

    if (!user.emailVerified) {
      await this.repository.recordLoginAttempt(
        LoginAttempt.create(email, ipAddress, false, user.id),
      );
      return err('EMAIL_NOT_VERIFIED');
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
    const parsed = Session.parse(rawToken);
    if (!parsed) {
      return err('SESSION_INVALID');
    }

    const session = await this.repository.findSessionBySelector(parsed.selector);

    if (!session || !session.matchesVerifier(parsed.verifier)) {
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
    const parsed = Session.parse(rawToken);
    if (!parsed) {
      return err('SESSION_INVALID');
    }

    const session = await this.repository.findSessionBySelector(parsed.selector);

    if (!session || !session.matchesVerifier(parsed.verifier)) {
      return err('SESSION_INVALID');
    }

    await this.repository.deleteSession(session.id);
    return ok(undefined);
  }

  async verifyEmail(token: string): Promise<Result<void, AuthErrorCode>> {
    const parsed = EmailVerificationToken.parse(token);
    if (!parsed) {
      return err('EMAIL_VERIFICATION_INVALID');
    }

    const record = await this.repository.findEmailVerificationBySelector(parsed.selector);
    if (!record) {
      return err('EMAIL_VERIFICATION_INVALID');
    }

    if (record.isExpired()) {
      await this.repository.deleteEmailVerification(record.id);
      return err('EMAIL_VERIFICATION_EXPIRED');
    }

    if (!record.matchesVerifier(parsed.verifier)) {
      await this.repository.deleteEmailVerification(record.id);
      return err('EMAIL_VERIFICATION_INVALID');
    }

    const user = await this.repository.findUserById(record.userId);
    if (!user) {
      await this.repository.deleteEmailVerification(record.id);
      return err('EMAIL_VERIFICATION_INVALID');
    }

    const verifiedUser = user.withEmailVerified();
    await this.repository.updateUser(verifiedUser);
    await this.repository.deleteEmailVerification(record.id);

    return ok(undefined);
  }

  async requestPasswordReset(email: string): Promise<Result<void, AuthErrorCode>> {
    const emailValidation = validateEmailInput(email);
    if (!emailValidation.success) {
      return err(emailValidation.error);
    }

    const normalizedEmail = emailValidation.data;
    const user = await this.repository.findUserByEmail(normalizedEmail);

    if (!user) {
      // Do not reveal existence
      return ok(undefined);
    }

    const existingTokens = await this.repository.findPasswordResetsByUserId(user.id);
    const activeTokens = existingTokens.filter((token) => !token.isExpired());

    for (const token of existingTokens) {
      if (token.isExpired()) {
        await this.repository.deletePasswordReset(token.id);
      }
    }

    if (activeTokens.length >= this.config.passwordReset.maxActiveTokens) {
      const excessCount = activeTokens.length - this.config.passwordReset.maxActiveTokens + 1;
      const tokensToDelete = activeTokens
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, excessCount);

      for (const token of tokensToDelete) {
        await this.repository.deletePasswordReset(token.id);
      }
    }

    const { token, rawToken } = PasswordResetToken.create(user.id, this.config.passwordReset.ttlMs);

    await this.repository.createPasswordResetToken(token);

    const resetLink = `${this.config.urls.baseUrl}/reset-password?token=${rawToken}`;
    await this.emailProvider.sendPasswordResetEmail(normalizedEmail, resetLink);

    return ok(undefined);
  }

  async resetPassword(input: ResetPasswordInput): Promise<Result<void, AuthErrorCode>> {
    const ipAddress = input.ipAddress ?? 'unknown';
    const baseRateLimitId = buildRateLimitIdentifier({
      ipAddress,
      userAgent: input.userAgent,
    });

    if (this.config.rateLimit.enabled) {
      const rateCheck = await this.rateLimiter.check(baseRateLimitId, 'passwordReset');
      if (!rateCheck.allowed) {
        return err('RATE_LIMIT_EXCEEDED');
      }
      await this.rateLimiter.consume(baseRateLimitId, 'passwordReset');
    }

    const parsed = PasswordResetToken.parse(input.token);
    if (!parsed) {
      return err('PASSWORD_RESET_INVALID');
    }

    const record = await this.repository.findPasswordResetBySelector(parsed.selector);
    if (!record) {
      return err('PASSWORD_RESET_INVALID');
    }

    if (record.isExpired()) {
      await this.repository.deletePasswordReset(record.id);
      return err('PASSWORD_RESET_EXPIRED');
    }

    if (!record.matchesVerifier(parsed.verifier)) {
      await this.repository.deletePasswordReset(record.id);
      return err('PASSWORD_RESET_INVALID');
    }

    const user = await this.repository.findUserById(record.userId);
    if (!user) {
      await this.repository.deletePasswordReset(record.id);
      return err('PASSWORD_RESET_INVALID');
    }

    if (this.config.rateLimit.enabled) {
      const compositeRateLimitId = buildRateLimitIdentifier({
        email: user.email,
        ipAddress,
        userAgent: input.userAgent,
      });
      const rateCheck = await this.rateLimiter.check(compositeRateLimitId, 'passwordReset');
      if (!rateCheck.allowed) {
        return err('RATE_LIMIT_EXCEEDED');
      }
      await this.rateLimiter.consume(compositeRateLimitId, 'passwordReset');
    }

    const passwordValidation = validatePassword(input.newPassword, {
      minLength: this.config.password.minLength,
      maxLength: this.config.password.maxLength,
    });

    if (!passwordValidation.valid) {
      await this.repository.deletePasswordReset(record.id);
      return err('PASSWORD_TOO_WEAK');
    }

    const account = await this.repository.findEmailAccountByUserId(user.id);
    if (!account) {
      await this.repository.deletePasswordReset(record.id);
      return err('PASSWORD_RESET_INVALID');
    }

    const newPasswordHash = await hashPassword(input.newPassword);
    await this.repository.updateEmailAccountPassword(user.id, newPasswordHash);
    await this.repository.deletePasswordReset(record.id);
    await this.repository.deleteSessionsByUserId(user.id);

    return ok(undefined);
  }
}
