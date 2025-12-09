import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRateLimiter } from '../../security/rate-limiter.js';

describe('MemoryRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('check()', () => {
    it('should allow requests when bucket has tokens', async () => {
      const limiter = new MemoryRateLimiter();

      const result = await limiter.check('user@example.com', 'login');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // 5 - 1 (would be consumed)
      expect(result.retryAfterMs).toBe(0);
    });

    it('should deny requests when bucket is empty', async () => {
      const limiter = new MemoryRateLimiter();

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.consume('user@example.com', 'login');
      }

      const result = await limiter.check('user@example.com', 'login');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should track different identifiers separately', async () => {
      const limiter = new MemoryRateLimiter();

      // Exhaust tokens for user1
      for (let i = 0; i < 5; i++) {
        await limiter.consume('user1@example.com', 'login');
      }

      // user2 should still have tokens
      const result = await limiter.check('user2@example.com', 'login');

      expect(result.allowed).toBe(true);
    });

    it('should track different actions separately', async () => {
      const limiter = new MemoryRateLimiter();

      // Exhaust tokens for login action
      for (let i = 0; i < 5; i++) {
        await limiter.consume('user@example.com', 'login');
      }

      // Different action should still have tokens
      const result = await limiter.check('user@example.com', 'other-action');

      expect(result.allowed).toBe(true);
    });
  });

  describe('consume()', () => {
    it('should decrease token count', async () => {
      const limiter = new MemoryRateLimiter();

      await limiter.consume('user@example.com', 'login');
      const result = await limiter.check('user@example.com', 'login');

      expect(result.remaining).toBe(3); // Started with 5, consumed 1, check would consume 1 more
    });

    it('should not go below zero tokens', async () => {
      const limiter = new MemoryRateLimiter();

      // Try to consume more than available
      for (let i = 0; i < 10; i++) {
        await limiter.consume('user@example.com', 'login');
      }

      const result = await limiter.check('user@example.com', 'login');

      expect(result.remaining).toBe(0);
    });
  });

  describe('reset()', () => {
    it('should reset the bucket for identifier and action', async () => {
      const limiter = new MemoryRateLimiter();

      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        await limiter.consume('user@example.com', 'login');
      }

      // Reset
      await limiter.reset('user@example.com', 'login');

      // Should have full tokens again
      const result = await limiter.check('user@example.com', 'login');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', async () => {
      const limiter = new MemoryRateLimiter();

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.consume('user@example.com', 'login');
      }

      // Advance time by 3 minutes (1 token refill)
      vi.advanceTimersByTime(3 * 60 * 1000);

      const result = await limiter.check('user@example.com', 'login');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0); // 1 refilled, 1 would be consumed
    });

    it('should not exceed max tokens when refilling', async () => {
      const limiter = new MemoryRateLimiter();

      // Advance time significantly
      vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour

      const result = await limiter.check('user@example.com', 'login');

      expect(result.remaining).toBeLessThanOrEqual(4); // Max 5, minus 1 for check
    });
  });

  describe('custom configuration', () => {
    it('should use custom config for specific actions', async () => {
      const limiter = new MemoryRateLimiter({
        'custom-action': {
          maxTokens: 3,
          refillRateMs: 60000, // 1 minute
          windowMs: 300000, // 5 minutes
        },
      });

      // Consume 3 tokens (custom max)
      for (let i = 0; i < 3; i++) {
        await limiter.consume('user@example.com', 'custom-action');
      }

      const result = await limiter.check('user@example.com', 'custom-action');

      expect(result.allowed).toBe(false);
    });

    it('should fall back to default login config for unknown actions', async () => {
      const limiter = new MemoryRateLimiter();

      const result = await limiter.check('user@example.com', 'unknown-action');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // Default is 5 max tokens
    });
  });
});
