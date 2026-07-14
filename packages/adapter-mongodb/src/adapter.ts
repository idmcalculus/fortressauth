import {
  Account,
  type AuthRepository,
  EmailVerificationToken,
  err,
  type LoginAttempt,
  NativeAuthorizationGrant,
  type OAuthProviderId,
  OAuthState,
  ok,
  PasswordResetToken,
  type ProviderId,
  type ResourceIntrospectionAuditEvent,
  type Result,
  Session,
  User,
} from '@fortressauth/core';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import { MongoServerError } from 'mongodb';
import {
  DEFAULT_COLLECTION_NAMES,
  type MongoAccountDocument,
  type MongoCollectionDocuments,
  type MongoCollectionNames,
  type MongoEmailVerificationDocument,
  type MongoPasswordResetDocument,
  type MongoSessionDocument,
  type MongoUserDocument,
} from './schema.js';

type MongoCollections = {
  users: Collection<MongoCollectionDocuments['users']>;
  accounts: Collection<MongoCollectionDocuments['accounts']>;
  sessions: Collection<MongoCollectionDocuments['sessions']>;
  emailVerifications: Collection<MongoCollectionDocuments['emailVerifications']>;
  passwordResets: Collection<MongoCollectionDocuments['passwordResets']>;
  loginAttempts: Collection<MongoCollectionDocuments['loginAttempts']>;
  oauthStates: Collection<MongoCollectionDocuments['oauthStates']>;
  nativeAuthorizationGrants: Collection<MongoCollectionDocuments['nativeAuthorizationGrants']>;
  resourceIntrospectionAudit: Collection<MongoCollectionDocuments['resourceIntrospectionAudit']>;
};

export interface MongoAdapterOptions {
  client: MongoClient;
  databaseName: string;
  collections?: Partial<MongoCollectionNames>;
  enableTransactions?: boolean;
  /** TTL for redacted introspection audit evidence. Defaults to 90 days. */
  resourceIntrospectionAuditRetentionSeconds?: number;
}

const DEFAULT_AUDIT_RETENTION_SECONDS = 90 * 24 * 60 * 60;

const TRANSACTION_UNSUPPORTED_PATTERNS = [
  /Transaction numbers are only allowed on a replica set member or mongos/i,
  /Transactions are not supported/i,
  /replica set/i,
];

function isDuplicateKeyError(error: unknown): boolean {
  return (
    error instanceof MongoServerError &&
    (error.code === 11000 || /E11000 duplicate key error/i.test(error.message))
  );
}

function isTransactionUnsupportedError(error: unknown): boolean {
  if (error instanceof MongoServerError) {
    if (error.code === 20 || error.codeName === 'IllegalOperation') {
      return true;
    }
    return TRANSACTION_UNSUPPORTED_PATTERNS.some((pattern) => pattern.test(error.message));
  }
  return error instanceof Error
    ? TRANSACTION_UNSUPPORTED_PATTERNS.some((pattern) => pattern.test(error.message))
    : false;
}

function toUser(doc: MongoUserDocument): User {
  return User.rehydrate({
    id: doc._id,
    email: doc.email,
    emailVerified: doc.emailVerified,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lockedUntil: doc.lockedUntil,
    disabledAt: doc.disabledAt ?? null,
  });
}

function toAccount(doc: MongoAccountDocument): Account {
  return Account.rehydrate({
    id: doc._id,
    userId: doc.userId,
    providerId: doc.providerId as ProviderId,
    providerUserId: doc.providerUserId,
    passwordHash: doc.passwordHash,
    createdAt: doc.createdAt,
  });
}

function toSession(doc: MongoSessionDocument): Session {
  return Session.rehydrate({
    id: doc._id,
    userId: doc.userId,
    selector: doc.selector,
    verifierHash: doc.verifierHash,
    expiresAt: doc.expiresAt,
    ipAddress: doc.ipAddress,
    userAgent: doc.userAgent,
    createdAt: doc.createdAt,
    nativeClientId: doc.nativeClientId ?? null,
    nativeAudiences: doc.nativeAudiences ?? null,
    nativeEmail: doc.nativeEmail ?? null,
    nativeEmailVerified: doc.nativeEmailVerified ?? null,
    authenticationTime: doc.authenticationTime ?? null,
  });
}

function toEmailVerification(doc: MongoEmailVerificationDocument): EmailVerificationToken {
  return EmailVerificationToken.rehydrate({
    id: doc._id,
    userId: doc.userId,
    selector: doc.selector,
    verifierHash: doc.verifierHash,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
  });
}

function toPasswordReset(doc: MongoPasswordResetDocument): PasswordResetToken {
  return PasswordResetToken.rehydrate({
    id: doc._id,
    userId: doc.userId,
    selector: doc.selector,
    verifierHash: doc.verifierHash,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
  });
}

export class MongoAdapter implements AuthRepository {
  private readonly client: MongoClient;
  private readonly db: Db;
  private readonly databaseName: string;
  private readonly collectionNames: MongoCollectionNames;
  private readonly collections: MongoCollections;
  private readonly session: ClientSession | undefined;
  private readonly enableTransactions: boolean;
  private readonly resourceIntrospectionAuditRetentionSeconds: number;

  constructor(options: MongoAdapterOptions, session?: ClientSession) {
    this.client = options.client;
    this.databaseName = options.databaseName;
    this.db = options.client.db(options.databaseName);
    this.collectionNames = {
      ...DEFAULT_COLLECTION_NAMES,
      ...(options.collections ?? {}),
    };
    this.collections = {
      users: this.db.collection<MongoCollectionDocuments['users']>(this.collectionNames.users),
      accounts: this.db.collection<MongoCollectionDocuments['accounts']>(
        this.collectionNames.accounts,
      ),
      sessions: this.db.collection<MongoCollectionDocuments['sessions']>(
        this.collectionNames.sessions,
      ),
      emailVerifications: this.db.collection<MongoCollectionDocuments['emailVerifications']>(
        this.collectionNames.emailVerifications,
      ),
      passwordResets: this.db.collection<MongoCollectionDocuments['passwordResets']>(
        this.collectionNames.passwordResets,
      ),
      loginAttempts: this.db.collection<MongoCollectionDocuments['loginAttempts']>(
        this.collectionNames.loginAttempts,
      ),
      oauthStates: this.db.collection<MongoCollectionDocuments['oauthStates']>(
        this.collectionNames.oauthStates,
      ),
      nativeAuthorizationGrants: this.db.collection<
        MongoCollectionDocuments['nativeAuthorizationGrants']
      >(this.collectionNames.nativeAuthorizationGrants),
      resourceIntrospectionAudit: this.db.collection<
        MongoCollectionDocuments['resourceIntrospectionAudit']
      >(this.collectionNames.resourceIntrospectionAudit),
    };
    this.session = session;
    this.enableTransactions = options.enableTransactions ?? true;
    this.resourceIntrospectionAuditRetentionSeconds =
      options.resourceIntrospectionAuditRetentionSeconds ?? DEFAULT_AUDIT_RETENTION_SECONDS;
    if (
      !Number.isInteger(this.resourceIntrospectionAuditRetentionSeconds) ||
      this.resourceIntrospectionAuditRetentionSeconds < 1
    ) {
      throw new Error('resourceIntrospectionAuditRetentionSeconds must be a positive integer');
    }
  }

  private sessionOptions(): { session?: ClientSession } {
    return this.session ? { session: this.session } : {};
  }

  private withSession(session: ClientSession): MongoAdapter {
    return new MongoAdapter(
      {
        client: this.client,
        databaseName: this.databaseName,
        collections: this.collectionNames,
        enableTransactions: this.enableTransactions,
        resourceIntrospectionAuditRetentionSeconds: this.resourceIntrospectionAuditRetentionSeconds,
      },
      session,
    );
  }

  /**
   * Wraps a repository operation so that driver-level errors (MongoServerError,
   * MongoNetworkError, etc.) are logged with the originating method name
   * before they bubble up to the orchestrator. Errors that are part of the
   * normal control flow (e.g. duplicate-key in `createUser`) are handled by
   * the method itself and never reach this wrapper.
   */
  private async run<T>(method: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      console.error(`[mongo-adapter] ${method} failed`, error);
      throw error;
    }
  }

  async ensureIndexes(): Promise<void> {
    return this.run('ensureIndexes', async () => {
      await Promise.all([
        this.collections.users.createIndex({ email: 1 }, { unique: true }),
        this.collections.accounts.createIndex(
          { providerId: 1, providerUserId: 1 },
          { unique: true },
        ),
        this.collections.accounts.createIndex({ userId: 1 }),
        this.collections.sessions.createIndex({ selector: 1 }, { unique: true }),
        this.collections.sessions.createIndex({ userId: 1 }),
        this.collections.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        this.collections.emailVerifications.createIndex({ selector: 1 }, { unique: true }),
        this.collections.emailVerifications.createIndex({ userId: 1 }),
        this.collections.passwordResets.createIndex({ selector: 1 }, { unique: true }),
        this.collections.passwordResets.createIndex({ userId: 1 }),
        this.collections.loginAttempts.createIndex({ email: 1, createdAt: -1 }),
        this.collections.oauthStates.createIndex({ state: 1 }, { unique: true }),
        this.collections.oauthStates.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        this.collections.nativeAuthorizationGrants.createIndex({ selector: 1 }, { unique: true }),
        this.collections.nativeAuthorizationGrants.createIndex(
          { expiresAt: 1 },
          { expireAfterSeconds: 0 },
        ),
        this.collections.resourceIntrospectionAudit.createIndex({ createdAt: -1 }),
        this.collections.resourceIntrospectionAudit.createIndex({
          resourceServerHash: 1,
          createdAt: -1,
        }),
        this.collections.resourceIntrospectionAudit.createIndex(
          { createdAt: 1 },
          {
            name: 'resource_introspection_audit_ttl',
            expireAfterSeconds: this.resourceIntrospectionAuditRetentionSeconds,
          },
        ),
      ]);
    });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.run('findUserByEmail', async () => {
      const doc = await this.collections.users.findOne(
        { email: email.toLowerCase() },
        this.sessionOptions(),
      );
      return doc ? toUser(doc as MongoUserDocument) : null;
    });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.run('findUserById', async () => {
      const doc = await this.collections.users.findOne({ _id: id }, this.sessionOptions());
      return doc ? toUser(doc as MongoUserDocument) : null;
    });
  }

  async createUser(user: User): Promise<Result<void, 'EMAIL_EXISTS'>> {
    // Note: not wrapped in run() because we intentionally translate
    // duplicate-key errors into a Result.
    try {
      await this.collections.users.insertOne(
        {
          _id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lockedUntil: user.lockedUntil,
          disabledAt: user.disabledAt,
        },
        this.sessionOptions(),
      );
      return ok(undefined);
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        return err('EMAIL_EXISTS');
      }
      console.error('[mongo-adapter] createUser failed', error);
      throw error;
    }
  }

  async updateUser(user: User): Promise<void> {
    return this.run('updateUser', async () => {
      await this.collections.users.updateOne(
        { _id: user.id },
        {
          $set: {
            email: user.email,
            emailVerified: user.emailVerified,
            updatedAt: user.updatedAt,
            lockedUntil: user.lockedUntil,
            disabledAt: user.disabledAt,
          },
        },
        this.sessionOptions(),
      );
    });
  }

  async findAccountByProvider(providerId: string, providerUserId: string): Promise<Account | null> {
    return this.run('findAccountByProvider', async () => {
      const doc = await this.collections.accounts.findOne(
        { providerId, providerUserId },
        this.sessionOptions(),
      );
      return doc ? toAccount(doc as MongoAccountDocument) : null;
    });
  }

  async findEmailAccountByUserId(userId: string): Promise<Account | null> {
    return this.run('findEmailAccountByUserId', async () => {
      const doc = await this.collections.accounts.findOne(
        { userId, providerId: 'email' },
        this.sessionOptions(),
      );
      return doc ? toAccount(doc as MongoAccountDocument) : null;
    });
  }

  async createAccount(account: Account): Promise<void> {
    return this.run('createAccount', async () => {
      await this.collections.accounts.insertOne(
        {
          _id: account.id,
          userId: account.userId,
          providerId: account.providerId,
          providerUserId: account.providerUserId,
          passwordHash: account.passwordHash,
          createdAt: account.createdAt,
        },
        this.sessionOptions(),
      );
    });
  }

  async updateEmailAccountPassword(userId: string, passwordHash: string): Promise<void> {
    return this.run('updateEmailAccountPassword', async () => {
      await this.collections.accounts.updateOne(
        { userId, providerId: 'email' },
        { $set: { passwordHash } },
        this.sessionOptions(),
      );
    });
  }

  async findSessionBySelector(selector: string): Promise<Session | null> {
    return this.run('findSessionBySelector', async () => {
      const doc = await this.collections.sessions.findOne({ selector }, this.sessionOptions());
      return doc ? toSession(doc as MongoSessionDocument) : null;
    });
  }

  async createSession(session: Session): Promise<void> {
    return this.run('createSession', async () => {
      await this.collections.sessions.insertOne(
        {
          _id: session.id,
          userId: session.userId,
          selector: session.selector,
          verifierHash: session.verifierHash,
          expiresAt: session.expiresAt,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          nativeClientId: session.nativeClientId,
          nativeAudiences: session.nativeAudiences === null ? null : [...session.nativeAudiences],
          nativeEmail: session.nativeEmail,
          nativeEmailVerified: session.nativeEmailVerified,
          authenticationTime: session.authenticationTime,
        },
        this.sessionOptions(),
      );
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.run('deleteSession', async () => {
      await this.collections.sessions.deleteOne({ _id: sessionId }, this.sessionOptions());
    });
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    return this.run('deleteSessionsByUserId', async () => {
      await this.collections.sessions.deleteMany({ userId }, this.sessionOptions());
    });
  }

  async recordResourceIntrospectionAudit(event: ResourceIntrospectionAuditEvent): Promise<void> {
    return this.run('recordResourceIntrospectionAudit', async () => {
      await this.collections.resourceIntrospectionAudit.insertOne(
        {
          _id: event.id,
          resourceServerHash: event.resourceServerHash,
          audienceHash: event.audienceHash,
          tokenSelectorHash: event.tokenSelectorHash,
          sessionId: event.sessionId,
          clientIdHash: event.clientIdHash,
          sourceIdentityHash: event.sourceIdentityHash,
          outcome: event.outcome,
          createdAt: event.createdAt,
        },
        this.sessionOptions(),
      );
    });
  }

  async pruneResourceIntrospectionAudit(before: Date): Promise<number> {
    return this.run('pruneResourceIntrospectionAudit', async () => {
      const result = await this.collections.resourceIntrospectionAudit.deleteMany(
        { createdAt: { $lt: before } },
        this.sessionOptions(),
      );
      return result.deletedCount;
    });
  }

  async createNativeAuthorizationGrant(grant: NativeAuthorizationGrant): Promise<void> {
    return this.run('createNativeAuthorizationGrant', async () => {
      await this.collections.nativeAuthorizationGrants.insertOne(
        {
          _id: grant.id,
          userId: grant.userId,
          clientId: grant.clientId,
          selector: grant.selector,
          verifierHash: grant.verifierHash,
          redirectUri: grant.redirectUri,
          codeChallenge: grant.codeChallenge,
          requestedAudience: grant.requestedAudience,
          requestedFreshnessSeconds: grant.requestedFreshnessSeconds,
          authenticationTime: grant.authenticationTime,
          expiresAt: grant.expiresAt,
          createdAt: grant.createdAt,
        },
        this.sessionOptions(),
      );
    });
  }

  async consumeNativeAuthorizationGrant(
    selector: string,
  ): Promise<NativeAuthorizationGrant | null> {
    return this.run('consumeNativeAuthorizationGrant', async () => {
      const doc = await this.collections.nativeAuthorizationGrants.findOneAndDelete(
        { selector },
        this.sessionOptions(),
      );
      if (!doc) return null;
      return NativeAuthorizationGrant.rehydrate({
        id: doc._id,
        userId: doc.userId,
        clientId: doc.clientId,
        selector: doc.selector,
        verifierHash: doc.verifierHash,
        redirectUri: doc.redirectUri,
        codeChallenge: doc.codeChallenge,
        requestedAudience: doc.requestedAudience ?? null,
        requestedFreshnessSeconds: doc.requestedFreshnessSeconds ?? null,
        authenticationTime: doc.authenticationTime ?? null,
        expiresAt: doc.expiresAt,
        createdAt: doc.createdAt,
      });
    });
  }

  async createEmailVerificationToken(token: EmailVerificationToken): Promise<void> {
    return this.run('createEmailVerificationToken', async () => {
      await this.collections.emailVerifications.insertOne(
        {
          _id: token.id,
          userId: token.userId,
          selector: token.selector,
          verifierHash: token.verifierHash,
          expiresAt: token.expiresAt,
          createdAt: token.createdAt,
        },
        this.sessionOptions(),
      );
    });
  }

  async findEmailVerificationBySelector(selector: string): Promise<EmailVerificationToken | null> {
    return this.run('findEmailVerificationBySelector', async () => {
      const doc = await this.collections.emailVerifications.findOne(
        { selector },
        this.sessionOptions(),
      );
      return doc ? toEmailVerification(doc as MongoEmailVerificationDocument) : null;
    });
  }

  async deleteEmailVerification(id: string): Promise<void> {
    return this.run('deleteEmailVerification', async () => {
      await this.collections.emailVerifications.deleteOne({ _id: id }, this.sessionOptions());
    });
  }

  async createPasswordResetToken(token: PasswordResetToken): Promise<void> {
    return this.run('createPasswordResetToken', async () => {
      await this.collections.passwordResets.insertOne(
        {
          _id: token.id,
          userId: token.userId,
          selector: token.selector,
          verifierHash: token.verifierHash,
          expiresAt: token.expiresAt,
          createdAt: token.createdAt,
        },
        this.sessionOptions(),
      );
    });
  }

  async findPasswordResetBySelector(selector: string): Promise<PasswordResetToken | null> {
    return this.run('findPasswordResetBySelector', async () => {
      const doc = await this.collections.passwordResets.findOne(
        { selector },
        this.sessionOptions(),
      );
      return doc ? toPasswordReset(doc as MongoPasswordResetDocument) : null;
    });
  }

  async findPasswordResetsByUserId(userId: string): Promise<PasswordResetToken[]> {
    return this.run('findPasswordResetsByUserId', async () => {
      const docs = await this.collections.passwordResets
        .find({ userId }, { ...this.sessionOptions(), sort: { createdAt: 1 } })
        .toArray();
      return docs.map((doc) => toPasswordReset(doc as MongoPasswordResetDocument));
    });
  }

  async deletePasswordReset(id: string): Promise<void> {
    return this.run('deletePasswordReset', async () => {
      await this.collections.passwordResets.deleteOne({ _id: id }, this.sessionOptions());
    });
  }

  async createOAuthState(state: OAuthState): Promise<void> {
    return this.run('createOAuthState', async () => {
      await this.collections.oauthStates.insertOne(
        {
          _id: state.id,
          providerId: state.providerId,
          state: state.state,
          codeVerifier: state.codeVerifier,
          redirectUri: state.redirectUri,
          nativeClientId: state.nativeClientId,
          nativeRedirectUri: state.nativeRedirectUri,
          nativeCodeChallenge: state.nativeCodeChallenge,
          nativeState: state.nativeState,
          nativeAudience: state.nativeAudience,
          nativeMaxAgeSeconds: state.nativeMaxAgeSeconds,
          expiresAt: state.expiresAt,
          createdAt: state.createdAt,
        },
        this.sessionOptions(),
      );
    });
  }

  async findOAuthStateByState(state: string): Promise<OAuthState | null> {
    return this.run('findOAuthStateByState', async () => {
      const doc = await this.collections.oauthStates.findOne({ state }, this.sessionOptions());

      if (!doc) {
        return null;
      }

      return OAuthState.rehydrate({
        id: doc._id,
        providerId: doc.providerId as OAuthProviderId,
        state: doc.state,
        codeVerifier: doc.codeVerifier,
        redirectUri: doc.redirectUri,
        nativeClientId: doc.nativeClientId ?? null,
        nativeRedirectUri: doc.nativeRedirectUri ?? null,
        nativeCodeChallenge: doc.nativeCodeChallenge ?? null,
        nativeState: doc.nativeState ?? null,
        nativeAudience: doc.nativeAudience ?? null,
        nativeMaxAgeSeconds: doc.nativeMaxAgeSeconds ?? null,
        expiresAt: doc.expiresAt,
        createdAt: doc.createdAt,
      });
    });
  }

  async consumeOAuthStateByState(state: string): Promise<OAuthState | null> {
    return this.run('consumeOAuthStateByState', async () => {
      const doc = await this.collections.oauthStates.findOneAndDelete(
        { state },
        this.sessionOptions(),
      );
      if (!doc) return null;
      return OAuthState.rehydrate({
        id: doc._id,
        providerId: doc.providerId as OAuthProviderId,
        state: doc.state,
        codeVerifier: doc.codeVerifier,
        redirectUri: doc.redirectUri,
        nativeClientId: doc.nativeClientId ?? null,
        nativeRedirectUri: doc.nativeRedirectUri ?? null,
        nativeCodeChallenge: doc.nativeCodeChallenge ?? null,
        nativeState: doc.nativeState ?? null,
        nativeAudience: doc.nativeAudience ?? null,
        nativeMaxAgeSeconds: doc.nativeMaxAgeSeconds ?? null,
        expiresAt: doc.expiresAt,
        createdAt: doc.createdAt,
      });
    });
  }

  async deleteOAuthState(id: string): Promise<void> {
    return this.run('deleteOAuthState', async () => {
      await this.collections.oauthStates.deleteOne({ _id: id }, this.sessionOptions());
    });
  }

  async recordLoginAttempt(attempt: LoginAttempt): Promise<void> {
    return this.run('recordLoginAttempt', async () => {
      await this.collections.loginAttempts.insertOne(
        {
          _id: attempt.id,
          userId: attempt.userId,
          email: attempt.email.toLowerCase(),
          ipAddress: attempt.ipAddress,
          success: attempt.success,
          createdAt: attempt.createdAt,
        },
        this.sessionOptions(),
      );
    });
  }

  async countRecentFailedAttempts(email: string, windowMs: number): Promise<number> {
    return this.run('countRecentFailedAttempts', async () => {
      const cutoffDate = new Date(Date.now() - windowMs);
      return await this.collections.loginAttempts.countDocuments(
        {
          email: email.toLowerCase(),
          success: false,
          createdAt: { $gte: cutoffDate },
        },
        this.sessionOptions(),
      );
    });
  }

  async transaction<T>(fn: (repo: AuthRepository) => Promise<T>): Promise<T> {
    if (!this.enableTransactions) {
      return await fn(this);
    }

    const session = this.client.startSession();
    try {
      return await session.withTransaction(async () => fn(this.withSession(session)));
    } catch (error: unknown) {
      if (isTransactionUnsupportedError(error)) {
        return await fn(this);
      }
      console.error('[mongo-adapter] transaction failed', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
