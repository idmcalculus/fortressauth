import type { RateLimiterPort } from '@fortressauth/core';
import type { Redis } from 'ioredis';

interface ActionConfig {
  maxTokens: number;
  refillRateMs: number;
  windowMs: number;
}

export interface RateLimitReservationEntry {
  identifier: string;
  action: string;
}

const RESERVE_SCRIPT = `
local now = tonumber(ARGV[1])
local states = {}

for index, key in ipairs(KEYS) do
  local offset = 2 + ((index - 1) * 3)
  local maxTokens = tonumber(ARGV[offset])
  local refillRateMs = tonumber(ARGV[offset + 1])
  local windowMs = tonumber(ARGV[offset + 2])
  local values = redis.call('HMGET', key, 'tokens', 'lastRefill')
  local tokens = values[1] and tonumber(values[1]) or maxTokens
  local lastRefill = values[2] and tonumber(values[2]) or now
  local elapsed = now - lastRefill
  local tokensToAdd = math.floor(elapsed / refillRateMs)

  if tokensToAdd > 0 then
    tokens = math.min(maxTokens, tokens + tokensToAdd)
    lastRefill = lastRefill + (tokensToAdd * refillRateMs)
  end

  if tokens <= 0 then
    return 0
  end

  states[index] = { tokens - 1, lastRefill, windowMs }
end

for index, key in ipairs(KEYS) do
  local state = states[index]
  redis.call('HMSET', key, 'tokens', state[1], 'lastRefill', state[2])
  redis.call('PEXPIRE', key, state[3])
end

return 1
`;

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

      // check() is deliberately non-consuming, matching RateLimiterPort and
      // MemoryRateLimiter. Callers consume only after every composite check passes.
      try {
        await this.redis.hmset(key, { tokens, lastRefill });
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
      if (this.failureMode === 'closed') throw error;
    }
  }

  /** Atomically checks and consumes every composite rate-limit dimension. */
  async reserve(entries: readonly RateLimitReservationEntry[]): Promise<boolean> {
    const unique = new Map<string, ActionConfig>();
    for (const entry of entries) {
      const key = this.key(entry.identifier, entry.action);
      if (!unique.has(key)) unique.set(key, this.getConfig(entry.action));
    }
    if (unique.size === 0) return true;

    const keys = [...unique.keys()];
    const args: Array<string | number> = [Date.now()];
    for (const config of unique.values()) {
      args.push(config.maxTokens, config.refillRateMs, config.windowMs);
    }

    try {
      const result = await this.redis.eval(RESERVE_SCRIPT, keys.length, ...keys, ...args);
      return Number(result) === 1;
    } catch (error) {
      this.logRedisError('reserve', error);
      return this.failureMode === 'open';
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
