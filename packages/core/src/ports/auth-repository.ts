import type { Account } from '../domain/entities/account.js';
import type { EmailVerificationToken } from '../domain/entities/email-verification-token.js';
import type { LoginAttempt } from '../domain/entities/login-attempt.js';
import type { NativeAuthorizationGrant } from '../domain/entities/native-authorization-grant.js';
import type { OAuthState } from '../domain/entities/oauth-state.js';
import type { PasswordResetToken } from '../domain/entities/password-reset-token.js';
import type { ResourceIntrospectionAuditEvent } from '../domain/entities/resource-introspection-audit-event.js';
import type { Session } from '../domain/entities/session.js';
import type { User } from '../domain/entities/user.js';
import type { Result } from '../types/result.js';

export interface AuthRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(user: User): Promise<Result<void, 'EMAIL_EXISTS'>>;
  updateUser(user: User): Promise<void>;

  findAccountByProvider(providerId: string, providerUserId: string): Promise<Account | null>;
  findEmailAccountByUserId(userId: string): Promise<Account | null>;
  createAccount(account: Account): Promise<void>;
  updateEmailAccountPassword(userId: string, passwordHash: string): Promise<void>;

  findSessionBySelector(selector: string): Promise<Session | null>;
  createSession(session: Session): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  deleteSessionsByUserId(userId: string): Promise<void>;

  createEmailVerificationToken(token: EmailVerificationToken): Promise<void>;
  findEmailVerificationBySelector(selector: string): Promise<EmailVerificationToken | null>;
  deleteEmailVerification(id: string): Promise<void>;

  createPasswordResetToken(token: PasswordResetToken): Promise<void>;
  findPasswordResetBySelector(selector: string): Promise<PasswordResetToken | null>;
  findPasswordResetsByUserId(userId: string): Promise<PasswordResetToken[]>;
  deletePasswordReset(id: string): Promise<void>;

  createOAuthState(state: OAuthState): Promise<void>;
  findOAuthStateByState(state: string): Promise<OAuthState | null>;
  deleteOAuthState(id: string): Promise<void>;

  recordLoginAttempt(attempt: LoginAttempt): Promise<void>;
  countRecentFailedAttempts(email: string, windowMs: number): Promise<number>;

  transaction<T>(fn: (repo: AuthRepository) => Promise<T>): Promise<T>;
}

/**
 * Optional persistence capability required only when native authorization or
 * resource introspection is enabled. Existing custom AuthRepository adapters
 * remain source-compatible; native flows detect this capability and fail
 * closed when it is absent.
 */
export interface NativeAuthorizationRepositoryPort {
  createNativeAuthorizationGrant(grant: NativeAuthorizationGrant): Promise<void>;
  /** Atomically removes and returns a grant. Only one concurrent caller may receive it. */
  consumeNativeAuthorizationGrant(selector: string): Promise<NativeAuthorizationGrant | null>;
  /** Atomically removes and returns OAuth state. */
  consumeOAuthStateByState(state: string): Promise<OAuthState | null>;
}

export interface ResourceIntrospectionAuditRepositoryPort {
  /** Append-only redacted evidence; adapters intentionally expose no update method. */
  recordResourceIntrospectionAudit(event: ResourceIntrospectionAuditEvent): Promise<void>;
  pruneResourceIntrospectionAudit(before: Date): Promise<number>;
}

export type NativeAuthRepository = AuthRepository &
  NativeAuthorizationRepositoryPort &
  ResourceIntrospectionAuditRepositoryPort;

export function supportsNativeAuthorizationRepository(
  repository: AuthRepository,
): repository is AuthRepository & NativeAuthorizationRepositoryPort {
  const candidate = repository as Partial<NativeAuthorizationRepositoryPort>;
  return (
    typeof candidate.createNativeAuthorizationGrant === 'function' &&
    typeof candidate.consumeNativeAuthorizationGrant === 'function' &&
    typeof candidate.consumeOAuthStateByState === 'function'
  );
}

export function supportsResourceIntrospectionAuditRepository(
  repository: AuthRepository,
): repository is AuthRepository & ResourceIntrospectionAuditRepositoryPort {
  const candidate = repository as Partial<ResourceIntrospectionAuditRepositoryPort>;
  return (
    typeof candidate.recordResourceIntrospectionAudit === 'function' &&
    typeof candidate.pruneResourceIntrospectionAudit === 'function'
  );
}

export function supportsNativeAuthRepository(
  repository: AuthRepository,
): repository is NativeAuthRepository {
  return (
    supportsNativeAuthorizationRepository(repository) &&
    supportsResourceIntrospectionAuditRepository(repository)
  );
}
