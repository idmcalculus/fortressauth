import type { Account } from '../domain/entities/account.js';
import type { EmailVerificationToken } from '../domain/entities/email-verification-token.js';
import type { LoginAttempt } from '../domain/entities/login-attempt.js';
import type { PasswordResetToken } from '../domain/entities/password-reset-token.js';
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

  recordLoginAttempt(attempt: LoginAttempt): Promise<void>;
  countRecentFailedAttempts(email: string, windowMs: number): Promise<number>;

  transaction<T>(fn: (repo: AuthRepository) => Promise<T>): Promise<T>;
}
