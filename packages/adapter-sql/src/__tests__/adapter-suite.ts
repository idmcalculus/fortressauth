import {
  Account,
  EmailVerificationToken,
  LoginAttempt,
  PasswordResetToken,
  Session,
  User,
} from '@fortressauth/core';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseDialect } from '../adapter.js';
import { SqlAdapter } from '../adapter.js';
import type { Database as DatabaseSchema } from '../schema.js';

export type AdapterTestContext = {
  db: Kysely<DatabaseSchema>;
  adapter: SqlAdapter;
  cleanup: () => Promise<void>;
};

export type AdapterTestOptions = {
  dialect: DatabaseDialect;
  createContext: () => Promise<AdapterTestContext>;
};

export function defineAdapterTestSuite(options: AdapterTestOptions): void {
  describe(`SqlAdapter (${options.dialect})`, () => {
    let db: Kysely<DatabaseSchema>;
    let adapter: SqlAdapter;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const context = await options.createContext();
      db = context.db;
      adapter = context.adapter;
      cleanup = context.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    describe('User operations', () => {
      describe('createUser()', () => {
        it('should create a user successfully', async () => {
          const user = User.create('test@example.com');
          const result = await adapter.createUser(user);

          expect(result.success).toBe(true);
        });

        it('should return EMAIL_EXISTS for duplicate email', async () => {
          const user1 = User.create('test@example.com');
          const user2 = User.create('test@example.com');

          await adapter.createUser(user1);
          const result = await adapter.createUser(user2);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('EMAIL_EXISTS');
          }
        });

        it('should return EMAIL_EXISTS when database reports duplicate key', async () => {
          const error = new Error('duplicate key value violates unique constraint');
          const fakeDb = {
            insertInto: () => ({
              values: () => ({
                execute: () => {
                  throw error;
                },
              }),
            }),
          };
          const failingAdapter = new SqlAdapter(fakeDb as unknown as Kysely<DatabaseSchema>, {
            dialect: options.dialect,
          });

          const result = await failingAdapter.createUser(User.create('test@example.com'));

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('EMAIL_EXISTS');
          }
        });

        it('should rethrow non-unique database errors', async () => {
          const error = new Error('connection lost');
          const fakeDb = {
            insertInto: () => ({
              values: () => ({
                execute: () => {
                  throw error;
                },
              }),
            }),
          };
          const failingAdapter = new SqlAdapter(fakeDb as unknown as Kysely<DatabaseSchema>, {
            dialect: options.dialect,
          });

          await expect(failingAdapter.createUser(User.create('test@example.com'))).rejects.toThrow(
            'connection lost',
          );
        });
      });

      describe('findUserByEmail()', () => {
        it('should find existing user by email', async () => {
          const user = User.create('test@example.com');
          await adapter.createUser(user);

          const found = await adapter.findUserByEmail('test@example.com');

          expect(found).not.toBeNull();
          expect(found?.email).toBe('test@example.com');
          expect(found?.id).toBe(user.id);
        });

        it('should return null for non-existent email', async () => {
          const found = await adapter.findUserByEmail('nonexistent@example.com');
          expect(found).toBeNull();
        });

        it('should be case-insensitive', async () => {
          const user = User.create('test@example.com');
          await adapter.createUser(user);

          const found = await adapter.findUserByEmail('TEST@EXAMPLE.COM');
          expect(found).not.toBeNull();
        });
      });

      describe('findUserById()', () => {
        it('should find existing user by id', async () => {
          const user = User.create('test@example.com');
          await adapter.createUser(user);

          const found = await adapter.findUserById(user.id);

          expect(found).not.toBeNull();
          expect(found?.id).toBe(user.id);
        });

        it('should return null for non-existent id', async () => {
          const found = await adapter.findUserById('nonexistent-id');
          expect(found).toBeNull();
        });
      });

      describe('updateUser()', () => {
        it('should update user fields', async () => {
          const user = User.create('test@example.com');
          await adapter.createUser(user);

          const verifiedUser = user.withEmailVerified();
          await adapter.updateUser(verifiedUser);

          const found = await adapter.findUserById(user.id);
          expect(found?.emailVerified).toBe(true);
        });

        it('should update lockedUntil', async () => {
          const user = User.create('test@example.com');
          await adapter.createUser(user);

          const lockDate = new Date('2024-01-20T00:00:00.000Z');
          const lockedUser = user.withLock(lockDate);
          await adapter.updateUser(lockedUser);

          const found = await adapter.findUserById(user.id);
          expect(found?.lockedUntil).toEqual(lockDate);
        });
      });
    });

    describe('Account operations', () => {
      let user: User;

      beforeEach(async () => {
        user = User.create('test@example.com');
        await adapter.createUser(user);
      });

      describe('createAccount()', () => {
        it('should create an email account', async () => {
          const account = Account.createEmailAccount(user.id, 'test@example.com', 'hash123');
          await adapter.createAccount(account);

          const found = await adapter.findEmailAccountByUserId(user.id);
          expect(found).not.toBeNull();
          expect(found?.passwordHash).toBe('hash123');
        });

        it('should create an OAuth account', async () => {
          const account = Account.createOAuthAccount(user.id, 'google', 'google-123');
          await adapter.createAccount(account);

          const found = await adapter.findAccountByProvider('google', 'google-123');
          expect(found).not.toBeNull();
          expect(found?.passwordHash).toBeNull();
        });
      });

      describe('findAccountByProvider()', () => {
        it('should find account by provider', async () => {
          const account = Account.createOAuthAccount(user.id, 'github', 'github-456');
          await adapter.createAccount(account);

          const found = await adapter.findAccountByProvider('github', 'github-456');
          expect(found).not.toBeNull();
          expect(found?.providerId).toBe('github');
        });

        it('should return null for non-existent provider account', async () => {
          const found = await adapter.findAccountByProvider('google', 'nonexistent');
          expect(found).toBeNull();
        });
      });

      describe('findEmailAccountByUserId()', () => {
        it('should find email account for user', async () => {
          const account = Account.createEmailAccount(user.id, 'test@example.com', 'hash');
          await adapter.createAccount(account);

          const found = await adapter.findEmailAccountByUserId(user.id);
          expect(found).not.toBeNull();
          expect(found?.providerId).toBe('email');
        });

        it('should return null when user has no email account', async () => {
          const found = await adapter.findEmailAccountByUserId(user.id);
          expect(found).toBeNull();
        });
      });

      describe('updateEmailAccountPassword()', () => {
        it('should update stored password hash', async () => {
          const account = Account.createEmailAccount(user.id, 'test@example.com', 'hash');
          await adapter.createAccount(account);

          await adapter.updateEmailAccountPassword(user.id, 'new-hash');
          const found = await adapter.findEmailAccountByUserId(user.id);
          expect(found?.passwordHash).toBe('new-hash');
        });
      });
    });

    describe('Session operations', () => {
      let user: User;

      beforeEach(async () => {
        user = User.create('test@example.com');
        await adapter.createUser(user);
      });

      describe('createSession()', () => {
        it('should create a session', async () => {
          const { session } = Session.create(user.id, 3600000);
          await adapter.createSession(session);

          const found = await adapter.findSessionBySelector(session.selector);
          expect(found).not.toBeNull();
          expect(found?.userId).toBe(user.id);
        });
      });

      describe('findSessionBySelector()', () => {
        it('should find session by selector', async () => {
          const { session } = Session.create(user.id, 3600000, '192.168.1.1', 'Mozilla/5.0');
          await adapter.createSession(session);

          const found = await adapter.findSessionBySelector(session.selector);
          expect(found).not.toBeNull();
          expect(found?.ipAddress).toBe('192.168.1.1');
          expect(found?.userAgent).toBe('Mozilla/5.0');
        });

        it('should return null for non-existent selector', async () => {
          const found = await adapter.findSessionBySelector('nonexistent');
          expect(found).toBeNull();
        });
      });

      describe('deleteSession()', () => {
        it('should delete a session', async () => {
          const { session } = Session.create(user.id, 3600000);
          await adapter.createSession(session);

          await adapter.deleteSession(session.id);

          const found = await adapter.findSessionBySelector(session.selector);
          expect(found).toBeNull();
        });
      });

      describe('deleteSessionsByUserId()', () => {
        it('should delete all sessions for a user', async () => {
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
    });

    describe('EmailVerification operations', () => {
      let user: User;

      beforeEach(async () => {
        user = User.create('test@example.com');
        await adapter.createUser(user);
      });

      it('should create and retrieve a verification token', async () => {
        const { token } = EmailVerificationToken.create(user.id, 3600000);
        await adapter.createEmailVerificationToken(token);

        const found = await adapter.findEmailVerificationBySelector(token.selector);
        expect(found).not.toBeNull();
        expect(found?.userId).toBe(user.id);

        if (found) {
          await adapter.deleteEmailVerification(found.id);
          const deleted = await adapter.findEmailVerificationBySelector(token.selector);
          expect(deleted).toBeNull();
        }
      });
    });

    describe('PasswordReset operations', () => {
      let user: User;

      beforeEach(async () => {
        user = User.create('test@example.com');
        await adapter.createUser(user);
      });

      it('should create and retrieve a password reset token', async () => {
        const { token } = PasswordResetToken.create(user.id, 3600000);
        await adapter.createPasswordResetToken(token);

        const found = await adapter.findPasswordResetBySelector(token.selector);
        expect(found).not.toBeNull();
        expect(found?.userId).toBe(user.id);

        if (found) {
          await adapter.deletePasswordReset(found.id);
          const deleted = await adapter.findPasswordResetBySelector(token.selector);
          expect(deleted).toBeNull();
        }
      });

      it('should list password reset tokens ordered by creation time', async () => {
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

        expect(resets).toHaveLength(2);
        expect(resets[0]?.id).toBe(oldToken.id);
        expect(resets[1]?.id).toBe(newToken.id);
      });
    });

    describe('Dialect helpers', () => {
      it('serializes booleans and dates for non-sqlite dialects', () => {
        const adapterWithDialect = new SqlAdapter(db, { dialect: 'postgres' });
        const helpers = adapterWithDialect as unknown as {
          serializeBoolean: (value: boolean) => boolean | number;
          parseBoolean: (value: boolean | number) => boolean;
          serializeDate: (value: Date) => Date | string;
          parseDate: (value: Date | string) => Date;
        };

        const date = new Date('2024-03-01T00:00:00.000Z');

        expect(helpers.serializeBoolean(true)).toBe(true);
        expect(helpers.serializeBoolean(false)).toBe(false);
        expect(helpers.parseBoolean(true)).toBe(true);
        expect(helpers.parseBoolean(false)).toBe(false);
        expect(helpers.serializeDate(date)).toBe(date);
        expect(helpers.parseDate(date)).toBe(date);
      });
    });

    describe('LoginAttempt operations', () => {
      describe('recordLoginAttempt()', () => {
        it('should record a login attempt', async () => {
          const attempt = LoginAttempt.create('test@example.com', '192.168.1.1', false);
          await adapter.recordLoginAttempt(attempt);

          // Verify by counting
          const count = await adapter.countRecentFailedAttempts('test@example.com', 3600000);
          expect(count).toBe(1);
        });
      });

      describe('countRecentFailedAttempts()', () => {
        it('should count failed attempts within window', async () => {
          const attempt1 = LoginAttempt.create('test@example.com', '192.168.1.1', false);
          const attempt2 = LoginAttempt.create('test@example.com', '192.168.1.1', false);
          const attempt3 = LoginAttempt.create('test@example.com', '192.168.1.1', true); // success

          await adapter.recordLoginAttempt(attempt1);
          await adapter.recordLoginAttempt(attempt2);
          await adapter.recordLoginAttempt(attempt3);

          const count = await adapter.countRecentFailedAttempts('test@example.com', 3600000);
          expect(count).toBe(2); // Only failed attempts
        });

        it('should be case-insensitive for email', async () => {
          const attempt = LoginAttempt.create('TEST@EXAMPLE.COM', '192.168.1.1', false);
          await adapter.recordLoginAttempt(attempt);

          const count = await adapter.countRecentFailedAttempts('test@example.com', 3600000);
          expect(count).toBe(1);
        });

        it('should return 0 when no failed attempts', async () => {
          const count = await adapter.countRecentFailedAttempts('test@example.com', 3600000);
          expect(count).toBe(0);
        });
      });
    });

    describe('transaction()', () => {
      it('should execute operations in a transaction', async () => {
        const user = User.create('test@example.com');

        await adapter.transaction(async (txRepo) => {
          await txRepo.createUser(user);
          const account = Account.createEmailAccount(user.id, 'test@example.com', 'hash');
          await txRepo.createAccount(account);
        });

        const found = await adapter.findUserByEmail('test@example.com');
        expect(found).not.toBeNull();
      });

      it('should rollback on error', async () => {
        const user = User.create('test@example.com');

        try {
          await adapter.transaction(async (txRepo) => {
            await txRepo.createUser(user);
            throw new Error('Simulated error');
          });
        } catch {
          // Expected
        }

        const found = await adapter.findUserByEmail('test@example.com');
        expect(found).toBeNull();
      });
    });
  });
}
