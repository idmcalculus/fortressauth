import {
  Account,
  EmailVerificationToken,
  LoginAttempt,
  NativeAuthorizationGrant,
  OAuthState,
  PasswordResetToken,
  ResourceIntrospectionAuditEvent,
  Session,
  User,
} from '@fortressauth/core';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoAdapter } from '../adapter.js';

const mongoUrl = process.env.MONGODB_TEST_URL ?? process.env.MONGODB_URL;
const describeIf = mongoUrl ? describe : describe.skip;

describeIf('MongoAdapter', () => {
  let client: MongoClient;
  let adapter: MongoAdapter;
  let dbName: string;

  beforeAll(async () => {
    client = new MongoClient(mongoUrl ?? '');
    await client.connect();
    dbName = `fortressauth_mongo_${Date.now()}`;
    adapter = new MongoAdapter({ client, databaseName: dbName });
    await adapter.ensureIndexes();
  });

  beforeEach(async () => {
    const db = client.db(dbName);
    await Promise.all([
      db.collection('users').deleteMany({}),
      db.collection('accounts').deleteMany({}),
      db.collection('sessions').deleteMany({}),
      db.collection('email_verifications').deleteMany({}),
      db.collection('password_resets').deleteMany({}),
      db.collection('login_attempts').deleteMany({}),
      db.collection('oauth_states').deleteMany({}),
      db.collection('native_authorization_grants').deleteMany({}),
      db.collection('resource_introspection_audit').deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await client.db(dbName).dropDatabase();
    await client.close();
  });

  it('creates required indexes', async () => {
    const db = client.db(dbName);
    const userIndexes = await db.collection('users').indexes();
    const accountIndexes = await db.collection('accounts').indexes();
    const sessionIndexes = await db.collection('sessions').indexes();
    const auditIndexes = await db.collection('resource_introspection_audit').indexes();

    expect(userIndexes.some((index) => index.key.email === 1 && index.unique)).toBe(true);
    expect(
      accountIndexes.some(
        (index) => index.key.providerId === 1 && index.key.providerUserId === 1 && index.unique,
      ),
    ).toBe(true);
    expect(auditIndexes.some((index) => index.key.createdAt === -1)).toBe(true);
    expect(
      auditIndexes.some(
        (index) =>
          index.name === 'resource_introspection_audit_ttl' &&
          index.key.createdAt === 1 &&
          index.expireAfterSeconds === 90 * 24 * 60 * 60,
      ),
    ).toBe(true);
    expect(sessionIndexes.some((index) => index.key.selector === 1 && index.unique)).toBe(true);
    expect(
      sessionIndexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0),
    ).toBe(true);
  });

  describe('User operations', () => {
    it('creates users and enforces unique email', async () => {
      const user = User.create('test@example.com');
      const result = await adapter.createUser(user);
      expect(result.success).toBe(true);

      const duplicate = await adapter.createUser(user);
      expect(duplicate.success).toBe(false);
      if (!duplicate.success) {
        expect(duplicate.error).toBe('EMAIL_EXISTS');
      }
    });

    it('finds users by email and id', async () => {
      const user = User.create('test@example.com');
      await adapter.createUser(user);

      const foundByEmail = await adapter.findUserByEmail('TEST@EXAMPLE.COM');
      expect(foundByEmail?.id).toBe(user.id);

      const foundById = await adapter.findUserById(user.id);
      expect(foundById?.email).toBe(user.email);

      expect(await adapter.findUserByEmail('missing@example.com')).toBeNull();
      expect(await adapter.findUserById('missing-user')).toBeNull();
    });

    it('rethrows non-duplicate database errors', async () => {
      const collections = Reflect.get(adapter, 'collections') as {
        users: { insertOne: (...args: unknown[]) => Promise<unknown> };
      };
      const failure = new Error('connection lost');
      const insert = vi.spyOn(collections.users, 'insertOne').mockRejectedValueOnce(failure);

      await expect(adapter.createUser(User.create('failure@example.com'))).rejects.toBe(failure);
      insert.mockRestore();
    });

    it('logs and rethrows repository operation failures', async () => {
      const collections = Reflect.get(adapter, 'collections') as {
        users: { findOne: (...args: unknown[]) => Promise<unknown> };
      };
      const failure = new Error('network unavailable');
      const findOne = vi.spyOn(collections.users, 'findOne').mockRejectedValueOnce(failure);

      await expect(adapter.findUserById('user-id')).rejects.toBe(failure);
      findOne.mockRestore();
    });

    it('updates user fields', async () => {
      const user = User.create('test@example.com');
      await adapter.createUser(user);

      const lockDate = new Date('2024-01-20T00:00:00.000Z');
      await adapter.updateUser(user.withEmailVerified().withLock(lockDate));

      const found = await adapter.findUserById(user.id);
      expect(found?.emailVerified).toBe(true);
      expect(found?.lockedUntil).toEqual(lockDate);
      await adapter.updateUser(user.withDisabled());
      expect((await adapter.findUserById(user.id))?.isDisabled()).toBe(true);
    });
  });

  describe('Account operations', () => {
    let user: User;

    beforeEach(async () => {
      user = User.create('test@example.com');
      await adapter.createUser(user);
    });

    it('creates email and OAuth accounts', async () => {
      const emailAccount = Account.createEmailAccount(user.id, user.email, 'hash123');
      await adapter.createAccount(emailAccount);

      const oauthAccount = Account.createOAuthAccount(user.id, 'google', 'google-123');
      await adapter.createAccount(oauthAccount);

      const foundEmail = await adapter.findEmailAccountByUserId(user.id);
      const foundOAuth = await adapter.findAccountByProvider('google', 'google-123');

      expect(foundEmail?.passwordHash).toBe('hash123');
      expect(foundOAuth?.passwordHash).toBeNull();
      expect(await adapter.findEmailAccountByUserId('missing-user')).toBeNull();
      expect(await adapter.findAccountByProvider('github', 'missing-provider-user')).toBeNull();
    });

    it('updates email account password', async () => {
      const emailAccount = Account.createEmailAccount(user.id, user.email, 'hash');
      await adapter.createAccount(emailAccount);

      await adapter.updateEmailAccountPassword(user.id, 'new-hash');
      const found = await adapter.findEmailAccountByUserId(user.id);
      expect(found?.passwordHash).toBe('new-hash');
    });
  });

  describe('Session operations', () => {
    let user: User;

    beforeEach(async () => {
      user = User.create('test@example.com');
      await adapter.createUser(user);
    });

    it('creates, finds, and deletes sessions', async () => {
      const { session } = Session.create(user.id, 3600000);
      await adapter.createSession(session);

      const found = await adapter.findSessionBySelector(session.selector);
      expect(found?.userId).toBe(user.id);

      await adapter.deleteSession(session.id);
      const deleted = await adapter.findSessionBySelector(session.selector);
      expect(deleted).toBeNull();
    });

    it('preserves native resource binding fields', async () => {
      const authenticationTime = new Date('2026-07-13T12:00:00.000Z');
      const { session } = Session.createNative({
        userId: user.id,
        ttlMs: 3_600_000,
        clientId: 'desktop-app',
        grantedAudiences: ['desktop-api'],
        email: user.email,
        emailVerified: true,
        authenticationTime,
      });
      await adapter.createSession(session);
      expect(await adapter.findSessionBySelector(session.selector)).toMatchObject({
        nativeClientId: 'desktop-app',
        nativeAudiences: ['desktop-api'],
        nativeEmail: user.email,
        nativeEmailVerified: true,
        authenticationTime,
      });
    });

    it('deletes all sessions for a user', async () => {
      const { session: session1 } = Session.create(user.id, 3600000);
      const { session: session2 } = Session.create(user.id, 3600000);
      await adapter.createSession(session1);
      await adapter.createSession(session2);

      await adapter.deleteSessionsByUserId(user.id);

      const found1 = await adapter.findSessionBySelector(session1.selector);
      const found2 = await adapter.findSessionBySelector(session2.selector);
      expect(found1).toBeNull();
      expect(found2).toBeNull();
    });
  });

  describe('EmailVerification operations', () => {
    it('creates and deletes verification tokens', async () => {
      const user = User.create('test@example.com');
      await adapter.createUser(user);

      const { token } = EmailVerificationToken.create(user.id, 3600000);
      await adapter.createEmailVerificationToken(token);

      const found = await adapter.findEmailVerificationBySelector(token.selector);
      expect(found?.userId).toBe(user.id);

      if (found) {
        await adapter.deleteEmailVerification(found.id);
        const deleted = await adapter.findEmailVerificationBySelector(token.selector);
        expect(deleted).toBeNull();
      }
    });
  });

  describe('PasswordReset operations', () => {
    it('creates, finds, and orders reset tokens', async () => {
      const user = User.create('test@example.com');
      await adapter.createUser(user);

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

      await adapter.createPasswordResetToken(newToken);
      await adapter.createPasswordResetToken(oldToken);

      const resets = await adapter.findPasswordResetsByUserId(user.id);
      expect(resets[0]?.id).toBe(oldToken.id);
      expect(resets[1]?.id).toBe(newToken.id);

      const found = await adapter.findPasswordResetBySelector(newToken.selector);
      expect(found?.userId).toBe(user.id);

      if (found) {
        await adapter.deletePasswordReset(found.id);
        const deleted = await adapter.findPasswordResetBySelector(newToken.selector);
        expect(deleted).toBeNull();
      }
    });
  });

  describe('LoginAttempt operations', () => {
    it('records and counts failed attempts', async () => {
      const attempt1 = LoginAttempt.create('test@example.com', '192.168.1.1', false);
      const attempt2 = LoginAttempt.create('test@example.com', '192.168.1.1', false);
      const attempt3 = LoginAttempt.create('test@example.com', '192.168.1.1', true);

      await adapter.recordLoginAttempt(attempt1);
      await adapter.recordLoginAttempt(attempt2);
      await adapter.recordLoginAttempt(attempt3);

      const count = await adapter.countRecentFailedAttempts('test@example.com', 3600000);
      expect(count).toBe(2);
    });
  });

  describe('transaction()', () => {
    it('executes operations in a transaction when available', async () => {
      const user = User.create('test@example.com');
      await adapter.transaction(async (txRepo) => {
        await txRepo.createUser(user);
        await txRepo.createAccount(Account.createEmailAccount(user.id, user.email, 'hash'));
      });

      const found = await adapter.findUserByEmail(user.email);
      expect(found).not.toBeNull();
    });

    it('falls back when transactions are disabled', async () => {
      const fallbackAdapter = new MongoAdapter({
        client,
        databaseName: dbName,
        enableTransactions: false,
      });
      const user = User.create('fallback@example.com');

      await fallbackAdapter.transaction(async (txRepo) => {
        await txRepo.createUser(user);
      });

      const found = await adapter.findUserByEmail(user.email);
      expect(found).not.toBeNull();
    });
  });

  describe('native authorization grants', () => {
    it('allows exactly one concurrent consumer', async () => {
      const user = User.create('native@example.com');
      await adapter.createUser(user);
      const { grant } = NativeAuthorizationGrant.create({
        userId: user.id,
        clientId: 'wraith',
        redirectUri: 'wraith://auth/callback',
        codeChallenge: 'A'.repeat(43),
        requestedAudience: 'wraith-api',
        requestedFreshnessSeconds: 300,
        authenticationTime: new Date('2026-07-13T12:00:00.000Z'),
        ttlMs: 60_000,
      });
      await adapter.createNativeAuthorizationGrant(grant);
      const results = await Promise.all([
        adapter.consumeNativeAuthorizationGrant(grant.selector),
        adapter.consumeNativeAuthorizationGrant(grant.selector),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(1);
      expect(results.find(Boolean)).toMatchObject({
        requestedAudience: 'wraith-api',
        requestedFreshnessSeconds: 300,
      });
    });
  });

  it('stores only redacted append-only resource audit evidence', async () => {
    const event = ResourceIntrospectionAuditEvent.create({
      resourceServerAudience: 'desktop-api',
      requestedAudience: 'desktop-api',
      tokenSelector: 'selector',
      sourceIdentity: '203.0.113.10',
      outcome: 'inactive',
    });
    await adapter.recordResourceIntrospectionAudit(event);
    const row = await client
      .db(dbName)
      .collection('resource_introspection_audit')
      .findOne({ _id: event.id });
    expect(row?.outcome).toBe('inactive');
    expect(JSON.stringify(row)).not.toContain('desktop-api');
    expect(JSON.stringify(row)).not.toContain('203.0.113.10');
  });

  it('prunes audit evidence older than a caller-supplied cutoff', async () => {
    const oldEvent = ResourceIntrospectionAuditEvent.create({ outcome: 'inactive' });
    const currentEvent = ResourceIntrospectionAuditEvent.create({ outcome: 'active' });
    await adapter.recordResourceIntrospectionAudit(oldEvent);
    await adapter.recordResourceIntrospectionAudit(currentEvent);
    await client
      .db(dbName)
      .collection('resource_introspection_audit')
      .updateOne({ _id: oldEvent.id }, { $set: { createdAt: new Date('2020-01-01') } });

    await expect(adapter.pruneResourceIntrospectionAudit(new Date('2021-01-01'))).resolves.toBe(1);
    expect(
      await client
        .db(dbName)
        .collection('resource_introspection_audit')
        .findOne({ _id: currentEvent.id }),
    ).not.toBeNull();
  });

  describe('OAuth states', () => {
    it('finds and deletes browser and native OAuth states', async () => {
      const browserState = OAuthState.create({
        providerId: 'google',
        state: 'browser-state',
      });
      const nativeState = OAuthState.create({
        providerId: 'github',
        state: 'native-state',
        nativeClientId: 'desktop-client',
        nativeRedirectUri: 'desktop-app://auth/callback',
        nativeCodeChallenge: 'A'.repeat(43),
        nativeState: 'desktop-state',
      });
      await adapter.createOAuthState(browserState);
      await adapter.createOAuthState(nativeState);

      expect(await adapter.findOAuthStateByState(browserState.state)).toMatchObject({
        nativeClientId: null,
        nativeRedirectUri: null,
        nativeCodeChallenge: null,
        nativeState: null,
      });
      expect(await adapter.findOAuthStateByState(nativeState.state)).toMatchObject({
        nativeClientId: 'desktop-client',
        nativeRedirectUri: 'desktop-app://auth/callback',
        nativeCodeChallenge: 'A'.repeat(43),
        nativeState: 'desktop-state',
      });

      await adapter.deleteOAuthState(nativeState.id);
      expect(await adapter.findOAuthStateByState(nativeState.state)).toBeNull();
    });

    it('allows exactly one concurrent callback consumer', async () => {
      const state = OAuthState.create({ providerId: 'google', state: 'one-time-state' });
      await adapter.createOAuthState(state);
      const results = await Promise.all([
        adapter.consumeOAuthStateByState(state.state),
        adapter.consumeOAuthStateByState(state.state),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(1);
    });
  });
});
