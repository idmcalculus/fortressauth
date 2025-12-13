import {
  Account,
  type AuthRepository,
  EmailVerificationToken,
  err,
  type LoginAttempt,
  ok,
  PasswordResetToken,
  type Result,
  Session,
  User,
} from '@fortressauth/core';
import type { Kysely } from 'kysely';
import type { Database } from './schema.js';

export type DatabaseDialect = 'sqlite' | 'postgres' | 'mysql';

export interface SqlAdapterOptions {
  /** Database dialect for proper type handling. Defaults to 'sqlite'. */
  dialect?: DatabaseDialect;
}

export class SqlAdapter implements AuthRepository {
  private readonly dialect: DatabaseDialect;

  constructor(
    private readonly db: Kysely<Database>,
    options: SqlAdapterOptions = {},
  ) {
    this.dialect = options.dialect ?? 'sqlite';
  }

  private isSqlite(): boolean {
    return this.dialect === 'sqlite';
  }

  private parseBoolean(value: number | boolean): boolean {
    return typeof value === 'boolean' ? value : value === 1;
  }

  private serializeBoolean(value: boolean): number | boolean {
    return this.isSqlite() ? (value ? 1 : 0) : value;
  }

  private parseDate(value: Date | string): Date {
    return typeof value === 'string' ? new Date(value) : value;
  }

  private serializeDate(value: Date): Date | string {
    return this.isSqlite() ? value.toISOString() : value;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const row = await this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email.toLowerCase())
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return User.rehydrate({
      id: row.id,
      email: row.email,
      emailVerified: this.parseBoolean(row.email_verified),
      createdAt: this.parseDate(row.created_at),
      updatedAt: this.parseDate(row.updated_at),
      lockedUntil: row.locked_until ? this.parseDate(row.locked_until) : null,
    });
  }

  async findUserById(id: string): Promise<User | null> {
    const row = await this.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();

    if (!row) {
      return null;
    }

    return User.rehydrate({
      id: row.id,
      email: row.email,
      emailVerified: this.parseBoolean(row.email_verified),
      createdAt: this.parseDate(row.created_at),
      updatedAt: this.parseDate(row.updated_at),
      lockedUntil: row.locked_until ? this.parseDate(row.locked_until) : null,
    });
  }

  async createUser(user: User): Promise<Result<void, 'EMAIL_EXISTS'>> {
    try {
      await this.db
        .insertInto('users')
        .values({
          id: user.id,
          email: user.email,
          email_verified: this.serializeBoolean(user.emailVerified),
          created_at: this.serializeDate(user.createdAt),
          updated_at: this.serializeDate(user.updatedAt),
          locked_until: user.lockedUntil ? this.serializeDate(user.lockedUntil) : null,
        })
        .execute();

      return ok(undefined);
    } catch (error: unknown) {
      // Check for unique constraint violation across different database drivers
      const isUniqueViolation =
        error instanceof Error &&
        (('code' in error && (error.code === 'SQLITE_CONSTRAINT' || error.code === '23505')) ||
          error.message?.includes('UNIQUE constraint failed') ||
          error.message?.includes('duplicate key'));
      if (isUniqueViolation) {
        return err('EMAIL_EXISTS');
      }
      throw error;
    }
  }

  async updateUser(user: User): Promise<void> {
    await this.db
      .updateTable('users')
      .set({
        email: user.email,
        email_verified: this.serializeBoolean(user.emailVerified),
        updated_at: this.serializeDate(user.updatedAt),
        locked_until: user.lockedUntil ? this.serializeDate(user.lockedUntil) : null,
      })
      .where('id', '=', user.id)
      .execute();
  }

  async findAccountByProvider(providerId: string, providerUserId: string): Promise<Account | null> {
    const row = await this.db
      .selectFrom('accounts')
      .selectAll()
      .where('provider_id', '=', providerId)
      .where('provider_user_id', '=', providerUserId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return Account.rehydrate({
      id: row.id,
      userId: row.user_id,
      providerId: row.provider_id as 'email' | 'google' | 'github',
      providerUserId: row.provider_user_id,
      passwordHash: row.password_hash,
      createdAt: this.parseDate(row.created_at),
    });
  }

  async findEmailAccountByUserId(userId: string): Promise<Account | null> {
    const row = await this.db
      .selectFrom('accounts')
      .selectAll()
      .where('user_id', '=', userId)
      .where('provider_id', '=', 'email')
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return Account.rehydrate({
      id: row.id,
      userId: row.user_id,
      providerId: row.provider_id as 'email' | 'google' | 'github',
      providerUserId: row.provider_user_id,
      passwordHash: row.password_hash,
      createdAt: this.parseDate(row.created_at),
    });
  }

  async createAccount(account: Account): Promise<void> {
    await this.db
      .insertInto('accounts')
      .values({
        id: account.id,
        user_id: account.userId,
        provider_id: account.providerId,
        provider_user_id: account.providerUserId,
        password_hash: account.passwordHash,
        created_at: this.serializeDate(account.createdAt),
      })
      .execute();
  }

  async updateEmailAccountPassword(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .updateTable('accounts')
      .set({ password_hash: passwordHash })
      .where('user_id', '=', userId)
      .where('provider_id', '=', 'email')
      .execute();
  }

  async findSessionBySelector(selector: string): Promise<Session | null> {
    const row = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('selector', '=', selector)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return Session.rehydrate({
      id: row.id,
      userId: row.user_id,
      selector: row.selector,
      verifierHash: row.verifier_hash,
      expiresAt: this.parseDate(row.expires_at),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: this.parseDate(row.created_at),
    });
  }

  async createSession(session: Session): Promise<void> {
    await this.db
      .insertInto('sessions')
      .values({
        id: session.id,
        user_id: session.userId,
        selector: session.selector,
        verifier_hash: session.verifierHash,
        expires_at: this.serializeDate(session.expiresAt),
        ip_address: session.ipAddress,
        user_agent: session.userAgent,
        created_at: this.serializeDate(session.createdAt),
      })
      .execute();
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.deleteFrom('sessions').where('id', '=', sessionId).execute();
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    await this.db.deleteFrom('sessions').where('user_id', '=', userId).execute();
  }

  async createEmailVerificationToken(token: EmailVerificationToken): Promise<void> {
    await this.db
      .insertInto('email_verifications')
      .values({
        id: token.id,
        user_id: token.userId,
        selector: token.selector,
        verifier_hash: token.verifierHash,
        expires_at: this.serializeDate(token.expiresAt),
        created_at: this.serializeDate(token.createdAt),
      })
      .execute();
  }

  async findEmailVerificationBySelector(selector: string): Promise<EmailVerificationToken | null> {
    const row = await this.db
      .selectFrom('email_verifications')
      .selectAll()
      .where('selector', '=', selector)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return EmailVerificationToken.rehydrate({
      id: row.id,
      userId: row.user_id,
      selector: row.selector,
      verifierHash: row.verifier_hash,
      expiresAt: this.parseDate(row.expires_at),
      createdAt: this.parseDate(row.created_at),
    });
  }

  async deleteEmailVerification(id: string): Promise<void> {
    await this.db.deleteFrom('email_verifications').where('id', '=', id).execute();
  }

  async createPasswordResetToken(token: PasswordResetToken): Promise<void> {
    await this.db
      .insertInto('password_resets')
      .values({
        id: token.id,
        user_id: token.userId,
        selector: token.selector,
        verifier_hash: token.verifierHash,
        expires_at: this.serializeDate(token.expiresAt),
        created_at: this.serializeDate(token.createdAt),
      })
      .execute();
  }

  async findPasswordResetBySelector(selector: string): Promise<PasswordResetToken | null> {
    const row = await this.db
      .selectFrom('password_resets')
      .selectAll()
      .where('selector', '=', selector)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return PasswordResetToken.rehydrate({
      id: row.id,
      userId: row.user_id,
      selector: row.selector,
      verifierHash: row.verifier_hash,
      expiresAt: this.parseDate(row.expires_at),
      createdAt: this.parseDate(row.created_at),
    });
  }

  async deletePasswordReset(id: string): Promise<void> {
    await this.db.deleteFrom('password_resets').where('id', '=', id).execute();
  }

  async recordLoginAttempt(attempt: LoginAttempt): Promise<void> {
    await this.db
      .insertInto('login_attempts')
      .values({
        id: attempt.id,
        user_id: attempt.userId,
        email: attempt.email,
        ip_address: attempt.ipAddress,
        success: this.serializeBoolean(attempt.success),
        created_at: this.serializeDate(attempt.createdAt),
      })
      .execute();
  }

  async countRecentFailedAttempts(email: string, windowMs: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - windowMs);
    // For SQLite, we need to compare as ISO string; for other DBs, use Date
    const cutoffValue = this.isSqlite() ? cutoffDate.toISOString() : cutoffDate;

    const result = await this.db
      .selectFrom('login_attempts')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('email', '=', email.toLowerCase())
      .where('success', '=', this.serializeBoolean(false) as boolean)
      .where('created_at', '>=', cutoffValue as Date)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  async transaction<T>(fn: (repo: AuthRepository) => Promise<T>): Promise<T> {
    return await this.db.transaction().execute(async (trx) => {
      const txAdapter = new SqlAdapter(trx as unknown as Kysely<Database>, {
        dialect: this.dialect,
      });
      return await fn(txAdapter);
    });
  }
}
