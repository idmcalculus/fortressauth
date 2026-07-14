import { Account, type OAuthProviderId } from './domain/entities/account.js';
import { EmailVerificationToken } from './domain/entities/email-verification-token.js';
import { LoginAttempt } from './domain/entities/login-attempt.js';
import { NativeAuthorizationGrant } from './domain/entities/native-authorization-grant.js';
import { OAuthState } from './domain/entities/oauth-state.js';
import { PasswordResetToken } from './domain/entities/password-reset-token.js';
import { Session } from './domain/entities/session.js';
import { User } from './domain/entities/user.js';
import {
  type AuthRepository,
  supportsNativeAuthorizationRepository,
} from './ports/auth-repository.js';
import type { EmailProviderPort } from './ports/email-provider.js';
import type { OAuthProviderPort } from './ports/oauth-provider.js';
import type { RateLimiterPort } from './ports/rate-limiter.js';
import type { FortressConfig, FortressConfigInput } from './schemas/config.js';
import { FortressConfigSchema } from './schemas/config.js';
import { isAuthenticationFresh } from './security/authentication-age.js';
import { isBreachedPassword } from './security/breached-password.js';
import { validateEmailInput, validatePasswordInput } from './security/input-validation.js';
import { generatePKCE, generateState } from './security/oauth-crypto.js';
import { hashPassword, verifyPassword } from './security/password.js';
import { buildRateLimitIdentifier } from './security/rate-limit-key.js';
import { validatePassword } from './security/validation.js';
import type { AuthErrorCode } from './types/errors.js';
import type { Result } from './types/result.js';
import { err, ok } from './types/result.js';

type RateLimitContext = {
  email?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
};

function buildRateLimitIdentifiers(context: RateLimitContext): string[] {
  const identifiers: string[] = [];

  if (context.ipAddress) {
    identifiers.push(buildRateLimitIdentifier({ ipAddress: context.ipAddress }));
  }

  identifiers.push(
    buildRateLimitIdentifier({
      email: context.email,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    }),
  );

  return Array.from(new Set(identifiers.filter((identifier) => identifier !== 'unknown')));
}

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

export interface NativeOAuthResult {
  user: User;
  authorizationCode: string;
  redirectUri: string;
  state: string;
}

export interface NativeTokenResult extends AuthResult {
  expiresAt: Date;
}

export interface NativeOAuthReturnTarget {
  redirectUri: string;
  state: string;
}

export interface NativeSessionIntrospection {
  userId: string;
  email: string | null;
  emailVerified: true;
  audience: string;
  clientId: string;
  expiresAt: Date;
  sessionId: string;
  authenticationTime: Date | null;
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
    if (
      (this.config.nativeAuth.clients.length > 0 ||
        this.config.nativeAuth.resourceServers.length > 0) &&
      !supportsNativeAuthorizationRepository(repository)
    ) {
      throw new Error('Native authentication requires NativeAuthRepositoryPort capabilities');
    }
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
    const rateLimitContext = {
      email,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };
    const rateLimitIdentifiers = buildRateLimitIdentifiers(rateLimitContext);

    if (this.config.rateLimit.enabled) {
      const allowed = await this.checkRateLimit('signup', rateLimitIdentifiers, rateLimitContext);
      if (!allowed) {
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

    if (this.config.password.breachedCheck.enabled) {
      const breached = await isBreachedPassword(input.password, this.config.password.breachedCheck);
      if (breached) {
        return err('PASSWORD_TOO_WEAK');
      }
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
      await this.consumeRateLimit('signup', rateLimitIdentifiers);
    }

    if (result.success) {
      const verificationLink = `${this.config.urls.baseUrl}/verify-email?token=${rawVerificationToken}`;
      await this.sendEmailSafely('sendVerificationEmail', () =>
        this.emailProvider.sendVerificationEmail(email, verificationLink),
      );
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
    const rateLimitContext = {
      email,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };
    const rateLimitIdentifiers = buildRateLimitIdentifiers(rateLimitContext);

    // Check rate limit first and consume a token for every attempt (prevents brute force)
    if (this.config.rateLimit.enabled) {
      const allowed = await this.checkRateLimit('login', rateLimitIdentifiers, rateLimitContext);
      if (!allowed) {
        await this.repository.recordLoginAttempt(LoginAttempt.create(email, ipAddress, false));
        return err('RATE_LIMIT_EXCEEDED');
      }
      // Consume token for every login attempt, not just successful ones
      await this.consumeRateLimit('login', rateLimitIdentifiers);
    }

    const user = await this.repository.findUserByEmail(email);

    if (!user) {
      // Perform dummy hash to prevent timing attacks
      await hashPassword('dummy-password-to-prevent-timing-attack');
      await this.repository.recordLoginAttempt(LoginAttempt.create(email, ipAddress, false));
      return err('INVALID_CREDENTIALS');
    }

    // Check lockout BEFORE password verification to prevent password oracle attacks
    if (user.isDisabled()) {
      await this.repository.recordLoginAttempt(
        LoginAttempt.create(email, ipAddress, false, user.id),
      );
      return err('ACCOUNT_DISABLED');
    }

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

    if (user.isDisabled()) {
      await this.repository.deleteSession(session.id);
      return err('ACCOUNT_DISABLED');
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

  async verifyEmail(
    token: string,
    context?: { ipAddress?: string | undefined; userAgent?: string | undefined },
  ): Promise<Result<void, AuthErrorCode>> {
    const rateLimitContext = {
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    };
    const rateLimitIdentifiers = buildRateLimitIdentifiers(rateLimitContext);

    if (this.config.rateLimit.enabled) {
      const allowed = await this.checkRateLimit(
        'verifyEmail',
        rateLimitIdentifiers,
        rateLimitContext,
      );
      if (!allowed) {
        return err('RATE_LIMIT_EXCEEDED');
      }
      await this.consumeRateLimit('verifyEmail', rateLimitIdentifiers);
    }

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

    if (this.config.rateLimit.enabled) {
      const userRateLimitContext = {
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      };
      const compositeIdentifier = buildRateLimitIdentifier(userRateLimitContext);
      const allowed = await this.checkRateLimit(
        'verifyEmail',
        [compositeIdentifier],
        userRateLimitContext,
      );
      if (!allowed) {
        return err('RATE_LIMIT_EXCEEDED');
      }
      await this.consumeRateLimit('verifyEmail', [compositeIdentifier]);
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
    await this.sendEmailSafely('sendPasswordResetEmail', () =>
      this.emailProvider.sendPasswordResetEmail(normalizedEmail, resetLink),
    );

    return ok(undefined);
  }

  async resetPassword(input: ResetPasswordInput): Promise<Result<void, AuthErrorCode>> {
    const rateLimitContext = {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };
    const rateLimitIdentifiers = buildRateLimitIdentifiers(rateLimitContext);

    if (this.config.rateLimit.enabled) {
      const allowed = await this.checkRateLimit(
        'passwordReset',
        rateLimitIdentifiers,
        rateLimitContext,
      );
      if (!allowed) {
        return err('RATE_LIMIT_EXCEEDED');
      }
      await this.consumeRateLimit('passwordReset', rateLimitIdentifiers);
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
      const userRateLimitContext = {
        email: user.email,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      };
      const compositeIdentifier = buildRateLimitIdentifier(userRateLimitContext);
      const allowed = await this.checkRateLimit(
        'passwordReset',
        [compositeIdentifier],
        userRateLimitContext,
      );
      if (!allowed) {
        return err('RATE_LIMIT_EXCEEDED');
      }
      await this.consumeRateLimit('passwordReset', [compositeIdentifier]);
    }

    const passwordValidation = validatePassword(input.newPassword, {
      minLength: this.config.password.minLength,
      maxLength: this.config.password.maxLength,
    });

    if (!passwordValidation.valid) {
      await this.repository.deletePasswordReset(record.id);
      return err('PASSWORD_TOO_WEAK');
    }

    if (this.config.password.breachedCheck.enabled) {
      const breached = await isBreachedPassword(
        input.newPassword,
        this.config.password.breachedCheck,
      );
      if (breached) {
        await this.repository.deletePasswordReset(record.id);
        return err('PASSWORD_TOO_WEAK');
      }
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

  /**
   * Generates an authorization URL for an OAuth provider and stores the state for verification.
   */
  async getOAuthAuthorizationUrl(
    provider: OAuthProviderPort,
    providerId: OAuthProviderId,
    options?: {
      redirectUri?: string;
      scopes?: string[];
      native?: {
        clientId: string;
        redirectUri: string;
        codeChallenge: string;
        state: string;
        audience?: string;
        maxAgeSeconds?: number;
      };
    },
  ): Promise<string> {
    if (options?.native) {
      if (!supportsNativeAuthorizationRepository(this.repository)) {
        throw new Error('NATIVE_AUTHORIZATION_INVALID');
      }
      if (!this.isAllowedNativeRedirect(options.native.clientId, options.native.redirectUri)) {
        throw new Error('NATIVE_REDIRECT_URI_INVALID');
      }
      if (
        options.native.audience &&
        !this.isAllowedNativeAudience(options.native.clientId, options.native.audience)
      ) {
        throw new Error('NATIVE_AUDIENCE_INVALID');
      }
      if (
        options.native.maxAgeSeconds !== undefined &&
        (!Number.isInteger(options.native.maxAgeSeconds) ||
          options.native.maxAgeSeconds < 1 ||
          options.native.maxAgeSeconds > 24 * 60 * 60)
      ) {
        throw new Error('STEP_UP_FAILED');
      }
      if (
        options.native.maxAgeSeconds !== undefined &&
        provider.supportsFreshAuthentication !== true
      ) {
        throw new Error('STEP_UP_UNSUPPORTED');
      }
    }
    const stateStr = generateState();
    const pkce = generatePKCE();

    const authorizationUrl = provider.getAuthorizationUrl({
      state: stateStr,
      codeChallenge: pkce.codeChallenge,
      ...(options?.scopes ? { scopes: options.scopes } : {}),
      ...(options?.native?.maxAgeSeconds !== undefined
        ? { freshAuthentication: { maxAgeSeconds: options.native.maxAgeSeconds } }
        : {}),
    });

    const oauthState = OAuthState.create({
      providerId,
      state: stateStr,
      codeVerifier: pkce.codeVerifier,
      ...(options?.redirectUri ? { redirectUri: options.redirectUri } : {}),
      ...(options?.native
        ? {
            nativeClientId: options.native.clientId,
            nativeRedirectUri: options.native.redirectUri,
            nativeCodeChallenge: options.native.codeChallenge,
            nativeState: options.native.state,
            ...(options.native.audience ? { nativeAudience: options.native.audience } : {}),
            ...(options.native.maxAgeSeconds !== undefined
              ? { nativeMaxAgeSeconds: options.native.maxAgeSeconds }
              : {}),
          }
        : {}),
    });

    await this.repository.createOAuthState(oauthState);

    return authorizationUrl;
  }

  /**
   * Handles the OAuth callback, exchanges code for tokens, and links or creates a user account.
   */
  async handleOAuthCallback(
    provider: OAuthProviderPort,
    providerId: OAuthProviderId,
    code: string,
    stateStr: string,
    context?: {
      ipAddress?: string;
      userAgent?: string;
      onNativeReturn?: (target: NativeOAuthReturnTarget) => void;
    },
  ): Promise<Result<AuthResult | NativeOAuthResult, AuthErrorCode>> {
    // 1. Validate state
    const oauthState = await this.consumeOAuthState(this.repository, stateStr);
    if (!oauthState || oauthState.isExpired() || oauthState.providerId !== providerId) {
      return err('OAUTH_STATE_MISMATCH');
    }
    if (oauthState.nativeRedirectUri && oauthState.nativeState) {
      context?.onNativeReturn?.({
        redirectUri: oauthState.nativeRedirectUri,
        state: oauthState.nativeState,
      });
    }

    // 2. Exchange code for tokens
    const tokenResult = await provider.validateCallback(
      code,
      oauthState.codeVerifier ? { codeVerifier: oauthState.codeVerifier } : {},
    );
    if (!tokenResult.success) {
      return err(tokenResult.error);
    }

    let authenticationTime: Date | null = null;
    const evidence = tokenResult.data.authenticationEvidence;
    if (oauthState.nativeMaxAgeSeconds !== null) {
      if (
        provider.supportsFreshAuthentication !== true ||
        !evidence ||
        evidence.providerVerified !== true ||
        evidence.ceremony !== 'fresh' ||
        !isAuthenticationFresh(evidence.authenticatedAt, oauthState.nativeMaxAgeSeconds, new Date())
      ) {
        return err('STEP_UP_FAILED');
      }
      authenticationTime = evidence.authenticatedAt;
    } else if (
      provider.supportsFreshAuthentication === true &&
      evidence?.providerVerified === true &&
      evidence.ceremony === 'fresh' &&
      Number.isFinite(evidence.authenticatedAt.getTime()) &&
      evidence.authenticatedAt <= new Date()
    ) {
      authenticationTime = evidence.authenticatedAt;
    }

    // 3. Get user info. Standard providers expect the OAuth access token here;
    // providers such as Apple can opt into whole-token handling explicitly.
    const userInfoResult = provider.getUserInfoFromTokens
      ? await provider.getUserInfoFromTokens(tokenResult.data)
      : await provider.getUserInfo(tokenResult.data.accessToken);
    if (!userInfoResult.success) {
      return err(userInfoResult.error);
    }

    const userInfo = userInfoResult.data;
    const emailValidation = validateEmailInput(userInfo.email);
    if (!emailValidation.success) {
      return err(emailValidation.error);
    }
    const email = emailValidation.data;

    // 4. Account linking / User creation logic
    const transactionResult = await this.repository.transaction<{
      result: Result<AuthResult | NativeOAuthResult, AuthErrorCode>;
      verificationEmail: { email: string; rawToken: string } | null;
    }>(async (repo) => {
      let verificationEmail: { email: string; rawToken: string } | null = null;
      // Find account by provider and provider user id
      let account = await repo.findAccountByProvider(providerId, userInfo.id);
      let user: User | null = null;

      if (account) {
        user = await repo.findUserById(account.userId);
        if (!user) {
          return { result: err('INTERNAL_ERROR'), verificationEmail };
        }
      } else {
        // Check if user exists by email
        user = await repo.findUserByEmail(email);

        if (user) {
          if (user.isDisabled()) {
            return { result: err('ACCOUNT_DISABLED'), verificationEmail };
          }
          if (user.isLocked()) {
            return { result: err('ACCOUNT_LOCKED'), verificationEmail };
          }
          // Link new account to existing user
          account = Account.createOAuthAccount(user.id, providerId, userInfo.id);
          await repo.createAccount(account);
        } else {
          // Create new user and account
          user = User.create(email);
          if (userInfo.emailVerified) {
            user = user.withEmailVerified();
          }
          account = Account.createOAuthAccount(user.id, providerId, userInfo.id);

          const createResult = await repo.createUser(user);
          if (!createResult.success) {
            return {
              result: err(createResult.error as AuthErrorCode),
              verificationEmail,
            };
          }

          await repo.createAccount(account);
        }
      }

      if (!user) {
        return { result: err('INTERNAL_ERROR'), verificationEmail };
      }

      if (user.isDisabled()) {
        return { result: err('ACCOUNT_DISABLED'), verificationEmail };
      }

      if (user.isLocked()) {
        return { result: err('ACCOUNT_LOCKED'), verificationEmail };
      }

      let effectiveUser = user;
      if (!user.emailVerified && userInfo.emailVerified) {
        effectiveUser = user.withEmailVerified();
        await repo.updateUser(effectiveUser);
      }

      if (!effectiveUser.emailVerified) {
        const { token, rawToken } = EmailVerificationToken.create(
          effectiveUser.id,
          this.config.emailVerification.ttlMs,
        );
        await repo.createEmailVerificationToken(token);
        verificationEmail = { email: effectiveUser.email, rawToken };
        return { result: err('EMAIL_NOT_VERIFIED'), verificationEmail };
      }

      if (
        oauthState.nativeClientId &&
        oauthState.nativeRedirectUri &&
        oauthState.nativeCodeChallenge &&
        oauthState.nativeState
      ) {
        const { grant, rawCode } = NativeAuthorizationGrant.create({
          userId: effectiveUser.id,
          clientId: oauthState.nativeClientId,
          redirectUri: oauthState.nativeRedirectUri,
          codeChallenge: oauthState.nativeCodeChallenge,
          ...(oauthState.nativeAudience ? { requestedAudience: oauthState.nativeAudience } : {}),
          ...(oauthState.nativeMaxAgeSeconds !== null
            ? { requestedFreshnessSeconds: oauthState.nativeMaxAgeSeconds }
            : {}),
          ...(authenticationTime ? { authenticationTime } : {}),
          ttlMs: this.config.nativeAuth.authorizationCodeTtlMs,
        });
        if (!supportsNativeAuthorizationRepository(repo)) {
          return { result: err('NATIVE_AUTHORIZATION_INVALID'), verificationEmail };
        }
        await repo.createNativeAuthorizationGrant(grant);
        return {
          result: ok({
            user: effectiveUser,
            authorizationCode: rawCode,
            redirectUri: oauthState.nativeRedirectUri,
            state: oauthState.nativeState,
          }),
          verificationEmail,
        };
      }

      // 5. Create browser session
      const { session, rawToken } = Session.create(
        effectiveUser.id,
        this.config.session.ttlMs,
        context?.ipAddress,
        context?.userAgent,
      );
      await repo.createSession(session);

      return { result: ok({ user: effectiveUser, token: rawToken }), verificationEmail };
    });

    const { result, verificationEmail } = transactionResult;

    if (verificationEmail) {
      const verificationLink = `${this.config.urls.baseUrl}/verify-email?token=${verificationEmail.rawToken}`;
      await this.sendEmailSafely('sendVerificationEmail', () =>
        this.emailProvider.sendVerificationEmail(verificationEmail.email, verificationLink),
      );
    }

    return result;
  }

  /**
   * Consumes a provider-error callback state and recovers only the native return target
   * stored by FortressAuth when authorization began. Provider callback redirect values
   * are deliberately not accepted here.
   */
  async consumeNativeOAuthFailure(
    providerId: OAuthProviderId,
    stateStr: string,
  ): Promise<Result<NativeOAuthReturnTarget, AuthErrorCode>> {
    const oauthState = await this.consumeOAuthState(this.repository, stateStr);
    if (
      !oauthState ||
      oauthState.isExpired() ||
      oauthState.providerId !== providerId ||
      !oauthState.nativeRedirectUri ||
      !oauthState.nativeState
    ) {
      return err('OAUTH_STATE_MISMATCH');
    }
    return ok({ redirectUri: oauthState.nativeRedirectUri, state: oauthState.nativeState });
  }

  async exchangeNativeAuthorizationCode(input: {
    clientId: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<Result<NativeTokenResult, AuthErrorCode>> {
    if (!supportsNativeAuthorizationRepository(this.repository)) {
      return err('NATIVE_AUTHORIZATION_INVALID');
    }
    const parsed = NativeAuthorizationGrant.parse(input.code);
    if (!parsed) return err('NATIVE_AUTHORIZATION_INVALID');

    // Consumption is deliberately first: any attempted replay or tampering burns the one-time code.
    const grant = await this.repository.consumeNativeAuthorizationGrant(parsed.selector);
    if (
      !grant ||
      grant.isExpired() ||
      !grant.matchesCodeVerifierHash(parsed.verifier) ||
      grant.clientId !== input.clientId ||
      grant.redirectUri !== input.redirectUri ||
      !grant.matchesPkceVerifier(input.codeVerifier)
    ) {
      return err('NATIVE_AUTHORIZATION_INVALID');
    }

    const user = await this.repository.findUserById(grant.userId);
    if (!user || user.isLocked() || user.isDisabled() || !user.emailVerified) {
      return err('NATIVE_AUTHORIZATION_INVALID');
    }

    const { session, rawToken } = Session.createNative({
      userId: user.id,
      ttlMs: this.config.nativeAuth.sessionTtlMs,
      clientId: grant.clientId,
      grantedAudiences: grant.requestedAudience ? [grant.requestedAudience] : [],
      email: user.email || null,
      emailVerified: user.emailVerified,
      authenticationTime: grant.authenticationTime,
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    });
    await this.repository.createSession(session);
    return ok({ user, token: rawToken, expiresAt: session.expiresAt });
  }

  private isAllowedNativeRedirect(clientId: string, redirectUri: string): boolean {
    const client = this.config.nativeAuth.clients.find(
      (candidate) => candidate.clientId === clientId,
    );
    return client?.redirectUris.includes(redirectUri) ?? false;
  }

  /** Safe host-side check used before returning native initiation errors to a registered URI. */
  isRegisteredNativeRedirect(clientId: string, redirectUri: string): boolean {
    return this.isAllowedNativeRedirect(clientId, redirectUri);
  }

  private async consumeOAuthState(
    repository: AuthRepository,
    state: string,
  ): Promise<OAuthState | null> {
    if (supportsNativeAuthorizationRepository(repository)) {
      return repository.consumeOAuthStateByState(state);
    }

    // Backward-compatible browser OAuth path for custom repositories that do
    // not opt into native capabilities. The repository transaction preserves
    // the strongest atomicity the existing adapter can provide.
    return repository.transaction(async (repo) => {
      const oauthState = await repo.findOAuthStateByState(state);
      if (oauthState) await repo.deleteOAuthState(oauthState.id);
      return oauthState;
    });
  }

  private isAllowedNativeAudience(clientId: string, audience: string): boolean {
    const client = this.config.nativeAuth.clients.find(
      (candidate) => candidate.clientId === clientId,
    );
    const resource = this.config.nativeAuth.resourceServers.find(
      (candidate) => candidate.audience === audience,
    );
    return Boolean(
      resource?.enabled &&
        client?.resourceAudiences.includes(audience) &&
        resource.allowedClientIds.includes(clientId),
    );
  }

  async introspectNativeSession(input: {
    token: string;
    audience: string;
    authenticatedResourceAudience: string;
  }): Promise<NativeSessionIntrospection | null> {
    const resource = this.config.nativeAuth.resourceServers.find(
      (candidate) => candidate.audience === input.authenticatedResourceAudience,
    );
    if (!resource?.enabled || resource.audience !== input.audience) return null;

    const parsed = Session.parse(input.token);
    if (!parsed) return null;
    const session = await this.repository.findSessionBySelector(parsed.selector);
    if (!session || !session.matchesVerifier(parsed.verifier)) return null;
    if (session.isExpired()) {
      await this.repository.deleteSession(session.id);
      return null;
    }
    if (
      !session.nativeClientId ||
      session.nativeAudiences === null ||
      !session.hasNativeAudience(resource.audience) ||
      !resource.allowedClientIds.includes(session.nativeClientId) ||
      session.nativeEmailVerified !== true
    ) {
      return null;
    }
    const user = await this.repository.findUserById(session.userId);
    if (!user || user.isDisabled() || user.isLocked() || !user.emailVerified) return null;

    return {
      userId: user.id,
      email: session.nativeEmail,
      emailVerified: true,
      audience: resource.audience,
      clientId: session.nativeClientId,
      expiresAt: session.expiresAt,
      sessionId: session.id,
      authenticationTime: session.authenticationTime,
    };
  }

  private async checkRateLimit(
    action: string,
    identifiers: string[],
    context: RateLimitContext,
  ): Promise<boolean> {
    for (const identifier of identifiers) {
      const rateCheck = await this.rateLimiter.check(identifier, action);
      if (!rateCheck.allowed) {
        this.logRateLimitViolation(action, identifiers, context);
        return false;
      }
    }
    return true;
  }

  private async consumeRateLimit(action: string, identifiers: string[]): Promise<void> {
    for (const identifier of identifiers) {
      await this.rateLimiter.consume(identifier, action);
    }
  }

  /**
   * Sends transactional email without allowing transport errors to fail the
   * caller. Email transports (SES, SendGrid, SMTP, Resend) routinely throw on
   * throttling, transient network issues, or recipient policy bounces. We have
   * already committed the user/account/token to the database by the time we
   * call out to the provider, so an exception here would convert a successful
   * flow into a 500 and leave the database in a confusing state. Log and
   * continue instead; the user can re-trigger via "resend verification" or
   * "request password reset" endpoints.
   */
  private async sendEmailSafely(label: string, send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      console.error(`[fortressauth] email send failed (${label})`, error);
    }
  }

  private logRateLimitViolation(
    action: string,
    identifiers: string[],
    context: RateLimitContext,
  ): void {
    console.warn('[fortressauth] rate limit exceeded', {
      action,
      identifiers,
      email: context.email,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }
}
