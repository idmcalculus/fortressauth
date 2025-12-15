import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisRateLimiter } from '../rate-limiters/redis-rate-limiter.js';

// Mock Redis client
function createMockRedis() {
	const store = new Map<string, Record<string, string>>();

	return {
		hmget: vi.fn().mockImplementation(async (key: string, ...fields: string[]) => {
			const data = store.get(key) || {};
			return fields.map(f => data[f] || null);
		}),
		hmset: vi.fn().mockImplementation(async (key: string, obj: Record<string, unknown>) => {
			const existing = store.get(key) || {};
			store.set(key, { ...existing, ...Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)])) });
			return 'OK';
		}),
		pexpire: vi.fn().mockResolvedValue(1),
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
			await limiter.check('user@example.com', 'login');
			await limiter.check('user@example.com', 'login');

			// Advance time by one refill interval (3 minutes = 180000ms)
			vi.advanceTimersByTime(3 * 60 * 1000);

			const result = await limiter.check('user@example.com', 'login');

			// Should have gained a token back
			expect(result.remaining).toBeGreaterThanOrEqual(1);
		});
	});
});
