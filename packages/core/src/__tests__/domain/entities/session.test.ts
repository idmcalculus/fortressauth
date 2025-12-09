import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from '../../../domain/entities/session.js';

describe('Session entity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create()', () => {
    it('should create a session with UUIDv7 id and random token', () => {
      const ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const { session, rawToken } = Session.create('user-123', ttlMs);

      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(session.userId).toBe('user-123');
      expect(session.tokenHash).toHaveLength(64); // SHA-256 hex
      expect(session.createdAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
      expect(session.expiresAt).toEqual(new Date('2024-01-22T10:00:00.000Z')); // 7 days later
      expect(session.ipAddress).toBeNull();
      expect(session.userAgent).toBeNull();

      // Raw token should be 32 bytes = 64 hex chars
      expect(rawToken).toHaveLength(64);
    });

    it('should include IP address and user agent when provided', () => {
      const { session } = Session.create('user-123', 3600000, '192.168.1.1', 'Mozilla/5.0');

      expect(session.ipAddress).toBe('192.168.1.1');
      expect(session.userAgent).toBe('Mozilla/5.0');
    });

    it('should generate different tokens for each session', () => {
      const { rawToken: token1 } = Session.create('user-123', 3600000);
      const { rawToken: token2 } = Session.create('user-123', 3600000);

      expect(token1).not.toBe(token2);
    });

    it('should hash the token correctly', () => {
      const { session, rawToken } = Session.create('user-123', 3600000);
      const expectedHash = Session.hashToken(rawToken);

      expect(session.tokenHash).toBe(expectedHash);
    });
  });

  describe('hashToken()', () => {
    it('should return SHA-256 hash of token', () => {
      const hash = Session.hashToken('test-token');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return consistent hash for same input', () => {
      const hash1 = Session.hashToken('same-token');
      const hash2 = Session.hashToken('same-token');

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different input', () => {
      const hash1 = Session.hashToken('token-1');
      const hash2 = Session.hashToken('token-2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct session from database data', () => {
      const data = {
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: 'user-123',
        tokenHash: 'abc123def456',
        expiresAt: new Date('2024-01-22T10:00:00.000Z'),
        ipAddress: '10.0.0.1',
        userAgent: 'Chrome/120',
        createdAt: new Date('2024-01-15T10:00:00.000Z'),
      };

      const session = Session.rehydrate(data);

      expect(session.id).toBe(data.id);
      expect(session.userId).toBe(data.userId);
      expect(session.tokenHash).toBe(data.tokenHash);
      expect(session.expiresAt).toEqual(data.expiresAt);
      expect(session.ipAddress).toBe(data.ipAddress);
      expect(session.userAgent).toBe(data.userAgent);
      expect(session.createdAt).toEqual(data.createdAt);
    });

    it('should handle null ipAddress and userAgent', () => {
      const session = Session.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: 'user-123',
        tokenHash: 'abc123',
        expiresAt: new Date(),
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      });

      expect(session.ipAddress).toBeNull();
      expect(session.userAgent).toBeNull();
    });
  });

  describe('isExpired()', () => {
    it('should return false when session is not expired', () => {
      const { session } = Session.create('user-123', 3600000); // 1 hour TTL
      expect(session.isExpired()).toBe(false);
    });

    it('should return true when session is expired', () => {
      const session = Session.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: 'user-123',
        tokenHash: 'abc123',
        expiresAt: new Date('2024-01-15T09:00:00.000Z'), // 1 hour ago
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2024-01-15T08:00:00.000Z'),
      });

      expect(session.isExpired()).toBe(true);
    });

    it('should return true when expiry time equals current time', () => {
      const session = Session.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: 'user-123',
        tokenHash: 'abc123',
        expiresAt: new Date('2024-01-15T10:00:00.000Z'), // exactly now
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2024-01-15T09:00:00.000Z'),
      });

      expect(session.isExpired()).toBe(true);
    });
  });
});
