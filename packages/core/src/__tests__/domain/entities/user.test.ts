import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../../domain/entities/user.js';

describe('User entity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create()', () => {
    it('should create a new user with UUIDv7 id', () => {
      const user = User.create('Test@Example.com');

      expect(user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(user.email).toBe('test@example.com'); // lowercase
      expect(user.emailVerified).toBe(false);
      expect(user.createdAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
      expect(user.updatedAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
      expect(user.lockedUntil).toBeNull();
    });

    it('should normalize email to lowercase', () => {
      const user = User.create('USER@DOMAIN.COM');
      expect(user.email).toBe('user@domain.com');
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct user from database data', () => {
      const data = {
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        email: 'test@example.com',
        emailVerified: true,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-10T00:00:00.000Z'),
        lockedUntil: new Date('2024-01-20T00:00:00.000Z'),
      };

      const user = User.rehydrate(data);

      expect(user.id).toBe(data.id);
      expect(user.email).toBe(data.email);
      expect(user.emailVerified).toBe(true);
      expect(user.createdAt).toEqual(data.createdAt);
      expect(user.updatedAt).toEqual(data.updatedAt);
      expect(user.lockedUntil).toEqual(data.lockedUntil);
    });

    it('should handle null lockedUntil', () => {
      const user = User.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lockedUntil: null,
      });

      expect(user.lockedUntil).toBeNull();
    });
  });

  describe('isLocked()', () => {
    it('should return false when lockedUntil is null', () => {
      const user = User.create('test@example.com');
      expect(user.isLocked()).toBe(false);
    });

    it('should return true when lockedUntil is in the future', () => {
      const user = User.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lockedUntil: new Date('2024-01-15T11:00:00.000Z'), // 1 hour in future
      });

      expect(user.isLocked()).toBe(true);
    });

    it('should return false when lockedUntil is in the past', () => {
      const user = User.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lockedUntil: new Date('2024-01-15T09:00:00.000Z'), // 1 hour in past
      });

      expect(user.isLocked()).toBe(false);
    });
  });

  describe('withEmailVerified()', () => {
    it('should return new user with emailVerified set to true', () => {
      const user = User.create('test@example.com');
      const verifiedUser = user.withEmailVerified();

      expect(verifiedUser.emailVerified).toBe(true);
      expect(verifiedUser.id).toBe(user.id);
      expect(verifiedUser.email).toBe(user.email);
      expect(verifiedUser.updatedAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
    });

    it('should not mutate original user', () => {
      const user = User.create('test@example.com');
      user.withEmailVerified();

      expect(user.emailVerified).toBe(false);
    });
  });

  describe('withLock()', () => {
    it('should return new user with lockedUntil set', () => {
      const user = User.create('test@example.com');
      const lockDate = new Date('2024-01-15T12:00:00.000Z');
      const lockedUser = user.withLock(lockDate);

      expect(lockedUser.lockedUntil).toEqual(lockDate);
      expect(lockedUser.id).toBe(user.id);
      expect(lockedUser.updatedAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
    });

    it('should not mutate original user', () => {
      const user = User.create('test@example.com');
      user.withLock(new Date('2024-01-15T12:00:00.000Z'));

      expect(user.lockedUntil).toBeNull();
    });
  });

  describe('toJSON()', () => {
    it('should return JSON-serializable object', () => {
      const user = User.create('test@example.com');
      const json = user.toJSON();

      expect(json).toEqual({
        id: user.id,
        email: 'test@example.com',
        emailVerified: false,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
        lockedUntil: null,
      });
    });

    it('should serialize lockedUntil when present', () => {
      const user = User.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        lockedUntil: new Date('2024-01-20T00:00:00.000Z'),
      });

      expect(user.toJSON().lockedUntil).toBe('2024-01-20T00:00:00.000Z');
    });
  });
});
