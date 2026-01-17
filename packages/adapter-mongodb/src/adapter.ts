import {
  Account,
  type AuthRepository,
  EmailVerificationToken,
  err,
  type LoginAttempt,
  type OAuthProviderId,
  OAuthState,
  ok,
  PasswordResetToken,
  type ProviderId,
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
};

export interface MongoAdapterOptions {
  client: MongoClient;
  databaseName: string;
  collections?: Partial<MongoCollectionNames>;
  enableTransactions?: boolean;
}

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
    };
    this.session = session;
    this.enableTransactions = options.enableTransactions ?? true;
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
      },
      session,
    );
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collections.users.createIndex({ email: 1 }, { unique: true }),
      this.collections.accounts.createIndex({ providerId: 1, providerUserId: 1 }, { unique: true }),
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
    ]);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const doc = await this.collections.users.findOne(
      { email: email.toLowerCase() },
      this.sessionOptions(),
    );
    return doc ? toUser(doc as MongoUserDocument) : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const doc = await this.collections.users.findOne({ _id: id }, this.sessionOptions());
    return doc ? toUser(doc as MongoUserDocument) : null;
  }

  async createUser(user: User): Promise<Result<void, 'EMAIL_EXISTS'>> {
    try {
      await this.collections.users.insertOne(
        {
          _id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lockedUntil: user.lockedUntil,
        },
        this.sessionOptions(),
      );
      return ok(undefined);
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        return err('EMAIL_EXISTS');
      }
      throw error;
    }
  }

  async updateUser(user: User): Promise<void> {
    await this.collections.users.updateOne(
      { _id: user.id },
      {
        $set: {
          email: user.email,
          emailVerified: user.emailVerified,
          updatedAt: user.updatedAt,
          lockedUntil: user.lockedUntil,
        },
      },
      this.sessionOptions(),
    );
  }

  async findAccountByProvider(providerId: string, providerUserId: string): Promise<Account | null> {
    const doc = await this.collections.accounts.findOne(
      { providerId, providerUserId },
      this.sessionOptions(),
    );
    return doc ? toAccount(doc as MongoAccountDocument) : null;
  }

  async findEmailAccountByUserId(userId: string): Promise<Account | null> {
    const doc = await this.collections.accounts.findOne(
      { userId, providerId: 'email' },
      this.sessionOptions(),
    );
    return doc ? toAccount(doc as MongoAccountDocument) : null;
  }

  async createAccount(account: Account): Promise<void> {
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
  }

  async updateEmailAccountPassword(userId: string, passwordHash: string): Promise<void> {
    await this.collections.accounts.updateOne(
      { userId, providerId: 'email' },
      { $set: { passwordHash } },
      this.sessionOptions(),
    );
  }

  async findSessionBySelector(selector: string): Promise<Session | null> {
    const doc = await this.collections.sessions.findOne({ selector }, this.sessionOptions());
    return doc ? toSession(doc as MongoSessionDocument) : null;
  }

  async createSession(session: Session): Promise<void> {
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
      },
      this.sessionOptions(),
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.collections.sessions.deleteOne({ _id: sessionId }, this.sessionOptions());
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    await this.collections.sessions.deleteMany({ userId }, this.sessionOptions());
  }

  async createEmailVerificationToken(token: EmailVerificationToken): Promise<void> {
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
  }

  async findEmailVerificationBySelector(selector: string): Promise<EmailVerificationToken | null> {
    const doc = await this.collections.emailVerifications.findOne(
      { selector },
      this.sessionOptions(),
    );
    return doc ? toEmailVerification(doc as MongoEmailVerificationDocument) : null;
  }

  async deleteEmailVerification(id: string): Promise<void> {
    await this.collections.emailVerifications.deleteOne({ _id: id }, this.sessionOptions());
  }

  async createPasswordResetToken(token: PasswordResetToken): Promise<void> {
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
  }

  async findPasswordResetBySelector(selector: string): Promise<PasswordResetToken | null> {
    const doc = await this.collections.passwordResets.findOne({ selector }, this.sessionOptions());
    return doc ? toPasswordReset(doc as MongoPasswordResetDocument) : null;
  }

  async findPasswordResetsByUserId(userId: string): Promise<PasswordResetToken[]> {
    const docs = await this.collections.passwordResets
      .find({ userId }, { ...this.sessionOptions(), sort: { createdAt: 1 } })
      .toArray();
    return docs.map((doc) => toPasswordReset(doc as MongoPasswordResetDocument));
  }

  async deletePasswordReset(id: string): Promise<void> {
    await this.collections.passwordResets.deleteOne({ _id: id }, this.sessionOptions());
  }

  async createOAuthState(state: OAuthState): Promise<void> {
    await this.collections.oauthStates.insertOne(
      {
        _id: state.id,
        providerId: state.providerId,
        state: state.state,
        codeVerifier: state.codeVerifier,
        redirectUri: state.redirectUri,
        expiresAt: state.expiresAt,
        createdAt: state.createdAt,
      },
      this.sessionOptions(),
    );
  }

  async findOAuthStateByState(state: string): Promise<OAuthState | null> {
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
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
    });
  }

  async deleteOAuthState(id: string): Promise<void> {
    await this.collections.oauthStates.deleteOne({ _id: id }, this.sessionOptions());
  }

  async recordLoginAttempt(attempt: LoginAttempt): Promise<void> {
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
  }

  async countRecentFailedAttempts(email: string, windowMs: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - windowMs);
    return await this.collections.loginAttempts.countDocuments(
      {
        email: email.toLowerCase(),
        success: false,
        createdAt: { $gte: cutoffDate },
      },
      this.sessionOptions(),
    );
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
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
