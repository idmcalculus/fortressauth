import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LoginAttempt } from '../../../domain/entities/login-attempt.js';

describe('LoginAttempt entity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create()', () => {
    it('should create a successful login attempt', () => {
      const attempt = LoginAttempt.create('test@example.com', '192.168.1.1', true, 'user-123');

      expect(attempt.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(attempt.email).toBe('test@example.com');
      expect(attempt.ipAddress).toBe('192.168.1.1');
      expect(attempt.success).toBe(true);
      expect(attempt.userId).toBe('user-123');
      expect(attempt.createdAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
    });

    it('should create a failed login attempt without userId', () => {
      const attempt = LoginAttempt.create('test@example.com', '10.0.0.1', false);

      expect(attempt.success).toBe(false);
      expect(attempt.userId).toBeNull();
    });

    it('should normalize email to lowercase', () => {
      const attempt = LoginAttempt.create('TEST@EXAMPLE.COM', '192.168.1.1', true);
      expect(attempt.email).toBe('test@example.com');
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct login attempt from database data', () => {
      const data = {
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: 'user-123',
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
        success: true,
        createdAt: new Date('2024-01-15T10:00:00.000Z'),
      };

      const attempt = LoginAttempt.rehydrate(data);

      expect(attempt.id).toBe(data.id);
      expect(attempt.userId).toBe(data.userId);
      expect(attempt.email).toBe(data.email);
      expect(attempt.ipAddress).toBe(data.ipAddress);
      expect(attempt.success).toBe(data.success);
      expect(attempt.createdAt).toEqual(data.createdAt);
    });

    it('should handle null userId', () => {
      const attempt = LoginAttempt.rehydrate({
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: null,
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
        success: false,
        createdAt: new Date(),
      });

      expect(attempt.userId).toBeNull();
    });
  });
});
