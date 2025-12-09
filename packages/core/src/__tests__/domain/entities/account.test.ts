import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../../domain/entities/account.js';

describe('Account entity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createEmailAccount()', () => {
    it('should create an email account with password hash', () => {
      const account = Account.createEmailAccount(
        'user-123',
        'Test@Example.com',
        'hashed_password_123',
      );

      expect(account.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(account.userId).toBe('user-123');
      expect(account.providerId).toBe('email');
      expect(account.providerUserId).toBe('test@example.com'); // lowercase
      expect(account.passwordHash).toBe('hashed_password_123');
      expect(account.createdAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
    });

    it('should normalize email to lowercase', () => {
      const account = Account.createEmailAccount('user-123', 'USER@DOMAIN.COM', 'hash');
      expect(account.providerUserId).toBe('user@domain.com');
    });
  });

  describe('createOAuthAccount()', () => {
    it('should create a Google OAuth account', () => {
      const account = Account.createOAuthAccount('user-123', 'google', 'google-user-456');

      expect(account.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(account.userId).toBe('user-123');
      expect(account.providerId).toBe('google');
      expect(account.providerUserId).toBe('google-user-456');
      expect(account.passwordHash).toBeNull();
      expect(account.createdAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
    });

    it('should create a GitHub OAuth account', () => {
      const account = Account.createOAuthAccount('user-123', 'github', 'github-user-789');

      expect(account.providerId).toBe('github');
      expect(account.providerUserId).toBe('github-user-789');
      expect(account.passwordHash).toBeNull();
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct account from database data', () => {
      const data = {
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: 'user-123',
        providerId: 'email' as const,
        providerUserId: 'test@example.com',
        passwordHash: 'hashed_password',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      const account = Account.rehydrate(data);

      expect(account.id).toBe(data.id);
      expect(account.userId).toBe(data.userId);
      expect(account.providerId).toBe(data.providerId);
      expect(account.providerUserId).toBe(data.providerUserId);
      expect(account.passwordHash).toBe(data.passwordHash);
      expect(account.createdAt).toEqual(data.createdAt);
    });

    it('should handle null passwordHash for OAuth accounts', () => {
      const account = Account.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: 'user-123',
        providerId: 'google',
        providerUserId: 'google-123',
        passwordHash: null,
        createdAt: new Date(),
      });

      expect(account.passwordHash).toBeNull();
    });
  });
});
