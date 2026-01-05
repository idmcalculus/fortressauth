import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailVerificationToken } from '../../../domain/entities/email-verification-token.js';

describe('EmailVerificationToken entity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rehydrate()', () => {
    it('should reconstruct token from database data preserving all properties', () => {
      const data = {
        id: '019af1e6-779e-7392-b584-20a4f2360749',
        userId: 'user-123',
        selector: 'abc123selector',
        verifierHash: 'hash456verifier',
        expiresAt: new Date('2024-01-16T10:00:00.000Z'),
        createdAt: new Date('2024-01-15T10:00:00.000Z'),
      };

      const token = EmailVerificationToken.rehydrate(data);

      expect(token.id).toBe(data.id);
      expect(token.userId).toBe(data.userId);
      expect(token.selector).toBe(data.selector);
      expect(token.verifierHash).toBe(data.verifierHash);
      expect(token.expiresAt).toEqual(data.expiresAt);
      expect(token.createdAt).toEqual(data.createdAt);
    });
  });
});
