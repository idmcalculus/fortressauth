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
    it('should create a session with selector/verifier split token', () => {
      const ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const { session, rawToken } = Session.create('user-123', ttlMs);

      expect(session.selector).toHaveLength(32); // 16 bytes hex
      expect(session.verifierHash).toHaveLength(64);
      expect(rawToken).toContain(':');
      expect(session.createdAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
      expect(session.expiresAt).toEqual(new Date('2024-01-22T10:00:00.000Z'));
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
  });

  describe('hashToken()', () => {
    it('should return SHA-256 hash of verifier', () => {
      const hash = Session.hashToken('test-token');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct session from database data', () => {
      const data = {
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: 'user-123',
        selector: 'selector123',
        verifierHash: 'abc123def456',
        expiresAt: new Date('2024-01-22T10:00:00.000Z'),
        ipAddress: '10.0.0.1',
        userAgent: 'Chrome/120',
        createdAt: new Date('2024-01-15T10:00:00.000Z'),
      };

      const session = Session.rehydrate(data);

      expect(session.id).toBe(data.id);
      expect(session.userId).toBe(data.userId);
      expect(session.selector).toBe(data.selector);
      expect(session.verifierHash).toBe(data.verifierHash);
      expect(session.expiresAt).toEqual(data.expiresAt);
      expect(session.ipAddress).toBe(data.ipAddress);
      expect(session.userAgent).toBe(data.userAgent);
      expect(session.createdAt).toEqual(data.createdAt);
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
        selector: 'selector123',
        verifierHash: 'abc123',
        expiresAt: new Date('2024-01-15T09:00:00.000Z'), // 1 hour ago
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2024-01-15T08:00:00.000Z'),
      });

      expect(session.isExpired()).toBe(true);
    });
  });
});
