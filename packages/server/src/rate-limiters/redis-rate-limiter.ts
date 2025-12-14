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
}

export class RedisRateLimiter implements RateLimiterPort {
  private readonly prefix: string;
  private readonly actions: Map<string, ActionConfig> = new Map();

  constructor(
    private readonly redis: Redis,
    options?: RedisRateLimiterOptions,
  ) {
    this.prefix = options?.prefix ?? 'fortress:ratelimit';
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
    const { tokens, lastRefill } = await this.refill(key, config);

    const allowed = tokens > 0;
    const remaining = Math.max(0, tokens - (allowed ? 1 : 0));
    const resetAt = new Date(lastRefill + config.refillRateMs);
    const retryAfterMs = allowed ? 0 : Math.max(0, resetAt.getTime() - Date.now());

    await this.redis.hmset(key, { tokens: remaining, lastRefill });
    await this.redis.pexpire(key, config.windowMs);

    return { allowed, remaining, resetAt, retryAfterMs } as const;
  }

  async consume(identifier: string, action: string): Promise<void> {
    const config = this.getConfig(action);
    const key = this.key(identifier, action);
    const { tokens, lastRefill } = await this.refill(key, config);
    const remaining = Math.max(0, tokens - 1);
    await this.redis.hmset(key, { tokens: remaining, lastRefill });
    await this.redis.pexpire(key, config.windowMs);
  }

  async reset(identifier: string, action: string): Promise<void> {
    await this.redis.del(this.key(identifier, action));
  }
}
