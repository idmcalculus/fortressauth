import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisRateLimiter } from '../rate-limiters/redis-rate-limiter.js';

// Mock Redis client
function createMockRedis() {
  const store = new Map<string, Record<string, string>>();

  return {
    hmget: vi.fn().mockImplementation(async (key: string, ...fields: string[]) => {
      const data = store.get(key) || {};
      return fields.map((f) => data[f] || null);
    }),
    hmset: vi.fn().mockImplementation(async (key: string, obj: Record<string, unknown>) => {
      const existing = store.get(key) || {};
      store.set(key, {
        ...existing,
        ...Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)])),
      });
      return 'OK';
    }),
    pexpire: vi.fn().mockResolvedValue(1),
    eval: vi
      .fn()
      .mockImplementation(
        async (_script: string, keyCount: number, ...values: Array<string | number>) => {
          const keys = values.slice(0, keyCount).map(String);
          const args = values.slice(keyCount).map(Number);
          const now = args[0] ?? Date.now();
          const reservations: Array<{
            key: string;
            tokens: number;
            lastRefill: number;
          }> = [];

          for (const [index, key] of keys.entries()) {
            const offset = 1 + index * 3;
            const maxTokens = args[offset] ?? 0;
            const refillRateMs = args[offset + 1] ?? 1;
            const data = store.get(key) ?? {};
            let tokens = data.tokens ? Number(data.tokens) : maxTokens;
            let lastRefill = data.lastRefill ? Number(data.lastRefill) : now;
            const tokensToAdd = Math.floor((now - lastRefill) / refillRateMs);
            if (tokensToAdd > 0) {
              tokens = Math.min(maxTokens, tokens + tokensToAdd);
              lastRefill += tokensToAdd * refillRateMs;
            }
            if (tokens <= 0) return 0;
            reservations.push({ key, tokens: tokens - 1, lastRefill });
          }

          for (const reservation of reservations) {
            store.set(reservation.key, {
              tokens: String(reservation.tokens),
              lastRefill: String(reservation.lastRefill),
            });
          }
          return 1;
        },
      ),
    del: vi.fn().mockImplementation(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    _store: store, // For test inspection
  };
}

describe('RedisRateLimiter', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let limiter: RedisRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
    redis = createMockRedis();
    limiter = new RedisRateLimiter(redis as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default prefix', () => {
      const limiter = new RedisRateLimiter(redis as never);
      expect(limiter).toBeDefined();
    });

    it('should use custom prefix', () => {
      const limiter = new RedisRateLimiter(redis as never, { prefix: 'custom:ratelimit' });
      expect(limiter).toBeDefined();
    });

    it('should accept custom action configs', () => {
      const limiter = new RedisRateLimiter(redis as never, {
        actions: {
          login: { maxTokens: 10, refillRateMs: 1000, windowMs: 5000 },
        },
      });
      expect(limiter).toBeDefined();
    });
  });

  describe('check()', () => {
    it('should allow request when tokens available', async () => {
      const result = await limiter.check('user@example.com', 'login');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // 5 - 1 = 4
      expect(result.retryAfterMs).toBe(0);
    });

    it('should use default config for unknown action', async () => {
      const result = await limiter.check('user@example.com', 'unknown-action');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should deny request when no tokens available', async () => {
      // Exhaust all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.check('user@example.com', 'login');
        await limiter.consume('user@example.com', 'login');
      }

      const result = await limiter.check('user@example.com', 'login');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should set expire on redis key', async () => {
      await limiter.check('user@example.com', 'login');

      expect(redis.pexpire).toHaveBeenCalled();
    });
  });

  describe('consume()', () => {
    it('should consume a token', async () => {
      await limiter.consume('user@example.com', 'login');

      expect(redis.hmset).toHaveBeenCalled();
    });

    it('should not go below zero tokens', async () => {
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.consume('user@example.com', 'login');
      }

      // Check remaining tokens
      const result = await limiter.check('user@example.com', 'login');
      expect(result.remaining).toBe(0);
    });
  });

  describe('reserve()', () => {
    it('atomically consumes composite dimensions', async () => {
      const limiter = new RedisRateLimiter(redis as never, {
        actions: {
          introspection: { maxTokens: 1, refillRateMs: 60_000, windowMs: 60_000 },
        },
      });
      const dimensions = [
        { identifier: 'global', action: 'introspection' },
        { identifier: 'resource', action: 'introspection' },
      ];

      await expect(limiter.reserve(dimensions)).resolves.toBe(true);
      await expect(limiter.reserve(dimensions)).resolves.toBe(false);
      expect(redis.eval).toHaveBeenCalledTimes(2);
    });

    it('fails closed when Redis cannot execute the reservation', async () => {
      redis.eval.mockRejectedValueOnce(new Error('Redis is down'));
      const limiter = new RedisRateLimiter(redis as never, { failureMode: 'closed' });

      await expect(
        limiter.reserve([{ identifier: 'resource', action: 'introspection' }]),
      ).resolves.toBe(false);
    });
  });

  describe('reset()', () => {
    it('should delete the rate limit key', async () => {
      await limiter.check('user@example.com', 'login');
      await limiter.reset('user@example.com', 'login');

      expect(redis.del).toHaveBeenCalledWith('fortress:ratelimit:login:user@example.com');
    });
  });

  describe('token refill', () => {
    it('should refill tokens after refill interval', async () => {
      // Use up some tokens
      await limiter.check('user@example.com', 'login');
      await limiter.consume('user@example.com', 'login');
      await limiter.check('user@example.com', 'login');
      await limiter.consume('user@example.com', 'login');
      await limiter.check('user@example.com', 'login');
      await limiter.consume('user@example.com', 'login');

      // Advance time by one refill interval (3 minutes = 180000ms)
      vi.advanceTimersByTime(3 * 60 * 1000);

      const result = await limiter.check('user@example.com', 'login');

      // Should have gained a token back
      expect(result.remaining).toBeGreaterThanOrEqual(1);
    });
  });

  describe('redis failure modes', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it('check() fails open by default and returns allowed=true on Redis errors', async () => {
      const failingRedis = createMockRedis();
      failingRedis.hmget.mockRejectedValueOnce(new Error('Redis is down'));
      const limiter = new RedisRateLimiter(failingRedis as never);

      const result = await limiter.check('user@example.com', 'login');
      expect(result.allowed).toBe(true);
      // Default config has 5 tokens; we should have 4 remaining when failing open.
      expect(result.remaining).toBe(4);
      expect(result.retryAfterMs).toBe(0);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('check failed (failureMode=open)'),
        expect.any(Error),
      );
    });

    it('check() fails closed when failureMode is "closed"', async () => {
      const failingRedis = createMockRedis();
      failingRedis.hmget.mockRejectedValueOnce(new Error('Redis is down'));
      const limiter = new RedisRateLimiter(failingRedis as never, { failureMode: 'closed' });

      const result = await limiter.check('user@example.com', 'login');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('consume() swallows Redis errors and does not throw', async () => {
      const failingRedis = createMockRedis();
      failingRedis.hmget.mockRejectedValueOnce(new Error('Redis is down'));
      const limiter = new RedisRateLimiter(failingRedis as never);

      await expect(limiter.consume('user@example.com', 'login')).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('consume failed'),
        expect.any(Error),
      );
    });

    it('consume() propagates Redis errors when failureMode is "closed"', async () => {
      const failingRedis = createMockRedis();
      failingRedis.hmget.mockRejectedValueOnce(new Error('Redis is down'));
      const limiter = new RedisRateLimiter(failingRedis as never, { failureMode: 'closed' });

      await expect(limiter.consume('user@example.com', 'login')).rejects.toThrow('Redis is down');
    });

    it('reset() swallows Redis errors and does not throw', async () => {
      const failingRedis = createMockRedis();
      failingRedis.del.mockRejectedValueOnce(new Error('Redis is down'));
      const limiter = new RedisRateLimiter(failingRedis as never);

      await expect(limiter.reset('user@example.com', 'login')).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('reset failed'), expect.any(Error));
    });

    it('check() runs pexpire in finally even when hmset rejects', async () => {
      const failingRedis = createMockRedis();
      failingRedis.hmset.mockRejectedValueOnce(new Error('hmset failed'));
      const limiter = new RedisRateLimiter(failingRedis as never);

      // The hmset throws inside the inner try/finally; the outer try catches
      // and we fall through to fail-open. pexpire still runs (best-effort
      // catch on its own promise).
      await limiter.check('user@example.com', 'login');
      expect(failingRedis.pexpire).toHaveBeenCalled();
    });

    it('throttles repeated identical errors to one log per minute', async () => {
      const failingRedis = createMockRedis();
      failingRedis.hmget.mockRejectedValue(new Error('persistent outage'));
      const limiter = new RedisRateLimiter(failingRedis as never);

      // Two failures in quick succession should produce one log line.
      await limiter.check('a', 'login');
      await limiter.check('b', 'login');
      expect(warn).toHaveBeenCalledTimes(1);

      // After ~61s, the next failure should log again.
      vi.advanceTimersByTime(61_000);
      await limiter.check('c', 'login');
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });
});
