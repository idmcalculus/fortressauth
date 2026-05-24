import type { RateLimiterPort } from '@fortressauth/core';
import type { Redis } from 'ioredis';

interface ActionConfig {
  maxTokens: number;
  refillRateMs: number;
  windowMs: number;
}

export interface RedisRateLimiterOptions {
  prefix?: string;
  actions?: Record<string, ActionConfig>;
  /**
   * Behavior when Redis is unreachable.
   *
   * - `'open'` (default): allow the request through and log a warning. This
   *   keeps authentication available during a Redis outage at the cost of
   *   temporarily disabling rate limiting. Recommended for most deployments
   *   where availability is the higher concern.
   * - `'closed'`: deny the request (treat as if rate limit is exceeded).
   *   Recommended when rate limiting is the primary brute-force defense and
   *   you would rather block sign-ins than risk a brute-force window during
   *   a Redis outage.
   */
  failureMode?: 'open' | 'closed';
}

export class RedisRateLimiter implements RateLimiterPort {
  private readonly prefix: string;
  private readonly actions: Map<string, ActionConfig> = new Map();
  private readonly failureMode: 'open' | 'closed';
  /**
   * Suppress repeated identical error logs to avoid log floods during a
   * sustained Redis outage. We log at most one error per minute per
   * (action, errorClass) tuple.
   */
  private lastErrorLogAt = 0;

  constructor(
    private readonly redis: Redis,
    options?: RedisRateLimiterOptions,
  ) {
    this.prefix = options?.prefix ?? 'fortress:ratelimit';
    this.failureMode = options?.failureMode ?? 'open';
    if (options?.actions) {
      for (const [action, config] of Object.entries(options.actions)) {
        this.actions.set(action, config);
      }
    }
  }

  private getConfig(action: string): ActionConfig {
    const configured = this.actions.get(action);
    if (configured) return configured;
    return { maxTokens: 5, refillRateMs: 3 * 60 * 1000, windowMs: 15 * 60 * 1000 };
  }

  private key(identifier: string, action: string): string {
    return `${this.prefix}:${action}:${identifier}`;
  }

  private logRedisError(operation: string, error: unknown): void {
    const now = Date.now();
    if (now - this.lastErrorLogAt < 60_000) {
      return;
    }
    this.lastErrorLogAt = now;
    console.error(
      `[redis-rate-limiter] ${operation} failed (failureMode=${this.failureMode})`,
      error,
    );
  }

  private async refill(
    key: string,
    config: ActionConfig,
  ): Promise<{ tokens: number; lastRefill: number }> {
    const now = Date.now();
    const [tokensStr, lastRefillStr] = await this.redis.hmget(key, 'tokens', 'lastRefill');
    let tokens = tokensStr ? Number(tokensStr) : config.maxTokens;
    let lastRefill = lastRefillStr ? Number(lastRefillStr) : now;

    const elapsed = now - lastRefill;
    const tokensToAdd = Math.floor(elapsed / config.refillRateMs);

    if (tokensToAdd > 0) {
      tokens = Math.min(config.maxTokens, tokens + tokensToAdd);
      lastRefill = lastRefill + tokensToAdd * config.refillRateMs;
    }

    return { tokens, lastRefill };
  }

  async check(identifier: string, action: string) {
    const config = this.getConfig(action);
    const key = this.key(identifier, action);

    try {
      const { tokens, lastRefill } = await this.refill(key, config);

      const allowed = tokens > 0;
      const remaining = Math.max(0, tokens - (allowed ? 1 : 0));
      const resetAt = new Date(lastRefill + config.refillRateMs);
      const retryAfterMs = allowed ? 0 : Math.max(0, resetAt.getTime() - Date.now());

      // Use a try/finally so a transient hmset failure does not leave the
      // key without a TTL. We still want pexpire to run.
      try {
        await this.redis.hmset(key, { tokens: remaining, lastRefill });
      } finally {
        await this.redis.pexpire(key, config.windowMs).catch(() => {
          // Swallowed: the next successful check() will reset the TTL. We
          // intentionally don't fail the request because of a missing TTL.
        });
      }

      return { allowed, remaining, resetAt, retryAfterMs } as const;
    } catch (error) {
      this.logRedisError('check', error);
      const allowed = this.failureMode === 'open';
      return {
        allowed,
        remaining: allowed ? config.maxTokens - 1 : 0,
        resetAt: new Date(Date.now() + config.refillRateMs),
        retryAfterMs: allowed ? 0 : config.refillRateMs,
      } as const;
    }
  }

  async consume(identifier: string, action: string): Promise<void> {
    const config = this.getConfig(action);
    const key = this.key(identifier, action);
    try {
      const { tokens, lastRefill } = await this.refill(key, config);
      const remaining = Math.max(0, tokens - 1);
      try {
        await this.redis.hmset(key, { tokens: remaining, lastRefill });
      } finally {
        await this.redis.pexpire(key, config.windowMs).catch(() => {
          /* see check() */
        });
      }
    } catch (error) {
      this.logRedisError('consume', error);
      // Fail-soft: do not throw. The next successful call will resync.
    }
  }

  async reset(identifier: string, action: string): Promise<void> {
    try {
      await this.redis.del(this.key(identifier, action));
    } catch (error) {
      this.logRedisError('reset', error);
    }
  }
}
