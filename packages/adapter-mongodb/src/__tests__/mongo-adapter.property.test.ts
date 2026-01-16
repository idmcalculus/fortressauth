/**
 * Property-Based Tests for MongoDB Adapter Equivalence
 *
 * Feature: fortressauth-platform
 * Property 25: MongoDB Adapter Equivalence
 * Validates: Requirements 8.6, 8.7
 */

import type { Database as DatabaseSchema } from '@fortressauth/adapter-sql';
import { down, SqlAdapter, up } from '@fortressauth/adapter-sql';
import {
  Account,
  EmailVerificationToken,
  LoginAttempt,
  MAX_EMAIL_LENGTH,
  PasswordResetToken,
  Session,
  User,
  validateEmailInput,
} from '@fortressauth/core';
import Database from 'better-sqlite3';
import * as fc from 'fast-check';
import { Kysely, SqliteDialect } from 'kysely';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoAdapter } from '../adapter.js';

const mongoUrl = process.env.MONGODB_TEST_URL ?? process.env.MONGODB_URL;
const describeIf = mongoUrl ? describe : describe.skip;

const validEmailArb: fc.Arbitrary<string> = fc
  .emailAddress({ size: 'small' })
  .filter((value) => value.length <= MAX_EMAIL_LENGTH && validateEmailInput(value).success);

const hexCharArb = fc.constantFrom(...'0123456789abcdef');
const hashArb: fc.Arbitrary<string> = fc.string({
  minLength: 8,
  maxLength: 64,
  unit: hexCharArb,
});
const providerArb = fc.constantFrom<'google' | 'github'>('google', 'github');

type SerializedUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lockedUntil: string | null;
};

type SerializedAccount = {
  id: string;
  userId: string;
  providerId: string;
  providerUserId: string;
  passwordHash: string | null;
  createdAt: string;
};

type SerializedSession = {
  id: string;
  userId: string;
  selector: string;
  verifierHash: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type SerializedToken = {
  id: string;
  userId: string;
  selector: string;
  verifierHash: string;
  expiresAt: string;
  createdAt: string;
};

function serializeUser(user: User | null): SerializedUser | null {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
  };
}

function serializeAccount(account: Account | null): SerializedAccount | null {
  if (!account) {
    return null;
  }
  return {
    id: account.id,
    userId: account.userId,
    providerId: account.providerId,
    providerUserId: account.providerUserId,
    passwordHash: account.passwordHash,
    createdAt: account.createdAt.toISOString(),
  };
}

function serializeSession(session: Session | null): SerializedSession | null {
  if (!session) {
    return null;
  }
  return {
    id: session.id,
    userId: session.userId,
    selector: session.selector,
    verifierHash: session.verifierHash,
    expiresAt: session.expiresAt.toISOString(),
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
  };
}

function serializeToken(
  token: EmailVerificationToken | PasswordResetToken | null,
): SerializedToken | null {
  if (!token) {
    return null;
  }
  return {
    id: token.id,
    userId: token.userId,
    selector: token.selector,
    verifierHash: token.verifierHash,
    expiresAt: token.expiresAt.toISOString(),
    createdAt: token.createdAt.toISOString(),
  };
}

describeIf('Property 25: MongoDB Adapter Equivalence', () => {
  let client: MongoClient;
  let mongoAdapter: MongoAdapter;
  let dbName: string;

  beforeAll(async () => {
    client = new MongoClient(mongoUrl ?? '');
    await client.connect();
    dbName = `fortressauth_property_${Date.now()}`;
    mongoAdapter = new MongoAdapter({ client, databaseName: dbName });
    await mongoAdapter.ensureIndexes();
  });

  afterAll(async () => {
    await client.db(dbName).dropDatabase();
    await client.close();
  });

  async function resetMongo(): Promise<void> {
    const db = client.db(dbName);
    await Promise.all([
      db.collection('users').deleteMany({}),
      db.collection('accounts').deleteMany({}),
      db.collection('sessions').deleteMany({}),
      db.collection('email_verifications').deleteMany({}),
      db.collection('password_resets').deleteMany({}),
      db.collection('login_attempts').deleteMany({}),
    ]);
  }

  it('should match SQL adapter behavior across operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArb,
        hashArb,
        providerArb,
        async (email: string, hash: string, provider: 'google' | 'github') => {
          await resetMongo();

          const sqlite = new Database(':memory:');
          const db = new Kysely<DatabaseSchema>({
            dialect: new SqliteDialect({ database: sqlite }),
          });
          const sqlDb = db as unknown as ConstructorParameters<typeof SqlAdapter>[0];
          await up(sqlDb, { dialect: 'sqlite' });
          const sqlAdapter = new SqlAdapter(sqlDb, { dialect: 'sqlite' });

          try {
            const user = User.create(email);
            const createSql = await sqlAdapter.createUser(user);
            const createMongo = await mongoAdapter.createUser(user);

            expect(createMongo).toEqual(createSql);

            const duplicateSql = await sqlAdapter.createUser(user);
            const duplicateMongo = await mongoAdapter.createUser(user);
            expect(duplicateMongo.success).toBe(false);
            expect(duplicateMongo).toEqual(duplicateSql);

            const foundSql = await sqlAdapter.findUserByEmail(email.toUpperCase());
            const foundMongo = await mongoAdapter.findUserByEmail(email.toUpperCase());
            expect(serializeUser(foundMongo)).toEqual(serializeUser(foundSql));

            const foundByIdSql = await sqlAdapter.findUserById(user.id);
            const foundByIdMongo = await mongoAdapter.findUserById(user.id);
            expect(serializeUser(foundByIdMongo)).toEqual(serializeUser(foundByIdSql));

            const verifiedUser = user.withEmailVerified();
            await sqlAdapter.updateUser(verifiedUser);
            await mongoAdapter.updateUser(verifiedUser);

            const updatedSql = await sqlAdapter.findUserById(user.id);
            const updatedMongo = await mongoAdapter.findUserById(user.id);
            expect(serializeUser(updatedMongo)).toEqual(serializeUser(updatedSql));

            const emailAccount = Account.createEmailAccount(user.id, user.email, hash);
            await sqlAdapter.createAccount(emailAccount);
            await mongoAdapter.createAccount(emailAccount);

            const oauthAccount = Account.createOAuthAccount(user.id, provider, `${provider}-user`);
            await sqlAdapter.createAccount(oauthAccount);
            await mongoAdapter.createAccount(oauthAccount);

            const accountSql = await sqlAdapter.findEmailAccountByUserId(user.id);
            const accountMongo = await mongoAdapter.findEmailAccountByUserId(user.id);
            expect(serializeAccount(accountMongo)).toEqual(serializeAccount(accountSql));

            const providerSql = await sqlAdapter.findAccountByProvider(
              provider,
              `${provider}-user`,
            );
            const providerMongo = await mongoAdapter.findAccountByProvider(
              provider,
              `${provider}-user`,
            );
            expect(serializeAccount(providerMongo)).toEqual(serializeAccount(providerSql));

            await sqlAdapter.updateEmailAccountPassword(user.id, `${hash}-updated`);
            await mongoAdapter.updateEmailAccountPassword(user.id, `${hash}-updated`);

            const updatedAccountSql = await sqlAdapter.findEmailAccountByUserId(user.id);
            const updatedAccountMongo = await mongoAdapter.findEmailAccountByUserId(user.id);
            expect(serializeAccount(updatedAccountMongo)).toEqual(
              serializeAccount(updatedAccountSql),
            );

            const { session: sessionOne } = Session.create(user.id, 3600000, '127.0.0.1', 'agent');
            await sqlAdapter.createSession(sessionOne);
            await mongoAdapter.createSession(sessionOne);

            const sessionSql = await sqlAdapter.findSessionBySelector(sessionOne.selector);
            const sessionMongo = await mongoAdapter.findSessionBySelector(sessionOne.selector);
            expect(serializeSession(sessionMongo)).toEqual(serializeSession(sessionSql));

            const { session: sessionTwo } = Session.create(user.id, 3600000);
            await sqlAdapter.createSession(sessionTwo);
            await mongoAdapter.createSession(sessionTwo);

            await sqlAdapter.deleteSession(sessionOne.id);
            await mongoAdapter.deleteSession(sessionOne.id);

            const deletedSql = await sqlAdapter.findSessionBySelector(sessionOne.selector);
            const deletedMongo = await mongoAdapter.findSessionBySelector(sessionOne.selector);
            expect(serializeSession(deletedMongo)).toEqual(serializeSession(deletedSql));

            await sqlAdapter.deleteSessionsByUserId(user.id);
            await mongoAdapter.deleteSessionsByUserId(user.id);

            const remainingSql = await sqlAdapter.findSessionBySelector(sessionTwo.selector);
            const remainingMongo = await mongoAdapter.findSessionBySelector(sessionTwo.selector);
            expect(serializeSession(remainingMongo)).toEqual(serializeSession(remainingSql));

            const { token: verificationToken } = EmailVerificationToken.create(user.id, 3600000);
            await sqlAdapter.createEmailVerificationToken(verificationToken);
            await mongoAdapter.createEmailVerificationToken(verificationToken);

            const verificationSql = await sqlAdapter.findEmailVerificationBySelector(
              verificationToken.selector,
            );
            const verificationMongo = await mongoAdapter.findEmailVerificationBySelector(
              verificationToken.selector,
            );
            expect(serializeToken(verificationMongo)).toEqual(serializeToken(verificationSql));

            if (verificationSql && verificationMongo) {
              await sqlAdapter.deleteEmailVerification(verificationSql.id);
              await mongoAdapter.deleteEmailVerification(verificationMongo.id);
            }

            const { token: baseOld } = PasswordResetToken.create(user.id, 3600000);
            const oldCreatedAt = new Date('2024-01-01T00:00:00.000Z');
            const oldToken = PasswordResetToken.rehydrate({
              id: baseOld.id,
              userId: baseOld.userId,
              selector: baseOld.selector,
              verifierHash: baseOld.verifierHash,
              expiresAt: new Date(oldCreatedAt.getTime() + 3600000),
              createdAt: oldCreatedAt,
            });

            const { token: baseNew } = PasswordResetToken.create(user.id, 3600000);
            const newCreatedAt = new Date('2024-02-01T00:00:00.000Z');
            const newToken = PasswordResetToken.rehydrate({
              id: baseNew.id,
              userId: baseNew.userId,
              selector: baseNew.selector,
              verifierHash: baseNew.verifierHash,
              expiresAt: new Date(newCreatedAt.getTime() + 3600000),
              createdAt: newCreatedAt,
            });

            await sqlAdapter.createPasswordResetToken(newToken);
            await mongoAdapter.createPasswordResetToken(newToken);
            await sqlAdapter.createPasswordResetToken(oldToken);
            await mongoAdapter.createPasswordResetToken(oldToken);

            const resetsSql = await sqlAdapter.findPasswordResetsByUserId(user.id);
            const resetsMongo = await mongoAdapter.findPasswordResetsByUserId(user.id);
            expect(resetsMongo.map(serializeToken)).toEqual(resetsSql.map(serializeToken));

            const resetSql = await sqlAdapter.findPasswordResetBySelector(newToken.selector);
            const resetMongo = await mongoAdapter.findPasswordResetBySelector(newToken.selector);
            expect(serializeToken(resetMongo)).toEqual(serializeToken(resetSql));

            if (resetSql && resetMongo) {
              await sqlAdapter.deletePasswordReset(resetSql.id);
              await mongoAdapter.deletePasswordReset(resetMongo.id);
            }

            const attemptFail = LoginAttempt.create(email, '127.0.0.1', false);
            const attemptSuccess = LoginAttempt.create(email, '127.0.0.1', true);
            await sqlAdapter.recordLoginAttempt(attemptFail);
            await mongoAdapter.recordLoginAttempt(attemptFail);
            await sqlAdapter.recordLoginAttempt(attemptSuccess);
            await mongoAdapter.recordLoginAttempt(attemptSuccess);

            const failedSql = await sqlAdapter.countRecentFailedAttempts(email, 3600000);
            const failedMongo = await mongoAdapter.countRecentFailedAttempts(email, 3600000);
            expect(failedMongo).toBe(failedSql);

            const txEmail = email.replace('@', '+tx@');
            await sqlAdapter.transaction(async (txRepo) => {
              await txRepo.createUser(User.create(txEmail));
            });
            await mongoAdapter.transaction(async (txRepo) => {
              await txRepo.createUser(User.create(txEmail));
            });

            const txSql = await sqlAdapter.findUserByEmail(txEmail);
            const txMongo = await mongoAdapter.findUserByEmail(txEmail);
            expect(serializeUser(txMongo)).toEqual(serializeUser(txSql));
          } finally {
            await down(sqlDb, { dialect: 'sqlite' });
            await db.destroy();
            sqlite.close();
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
