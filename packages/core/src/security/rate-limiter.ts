import type { RateLimiterPort } from '../ports/rate-limiter.js';

interface TokenBucket {
  tokens: number;
  lastRefill: Date;
}

interface ActionConfig {
  maxTokens: number;
  refillRateMs: number;
  windowMs: number;
}

const DEFAULT_LOGIN_CONFIG: ActionConfig = {
  maxTokens: 5,
  refillRateMs: 3 * 60 * 1000, // 3 minutes per token
  windowMs: 15 * 60 * 1000, // 15 minute window
};

const DEFAULT_PASSWORD_RESET_CONFIG: ActionConfig = {
  maxTokens: 5,
  refillRateMs: 3 * 60 * 1000, // 3 minutes per token
  windowMs: 15 * 60 * 1000, // 15 minute window
};

const DEFAULT_CONFIGS: Record<string, ActionConfig> = {
  login: DEFAULT_LOGIN_CONFIG,
  passwordReset: DEFAULT_PASSWORD_RESET_CONFIG,
};

export class MemoryRateLimiter implements RateLimiterPort {
  private buckets: Map<string, TokenBucket> = new Map();
  private configs: Map<string, ActionConfig> = new Map();

  constructor(configs?: Record<string, ActionConfig>) {
    if (configs) {
      for (const [action, config] of Object.entries(configs)) {
        this.configs.set(action, config);
      }
    }
  }

  private getConfig(action: string): ActionConfig {
    const customConfig = this.configs.get(action);
    if (customConfig) {
      return customConfig;
    }
    const defaultConfig = DEFAULT_CONFIGS[action];
    if (defaultConfig) {
      return defaultConfig;
    }
    // Fallback to login config as the default
    return DEFAULT_LOGIN_CONFIG;
  }

  private getKey(identifier: string, action: string): string {
    return `${identifier}:${action}`;
  }

  private refillBucket(bucket: TokenBucket, config: ActionConfig): void {
    const now = new Date();
    const timeSinceLastRefill = now.getTime() - bucket.lastRefill.getTime();
    const tokensToAdd = Math.floor(timeSinceLastRefill / config.refillRateMs);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(config.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = new Date(bucket.lastRefill.getTime() + tokensToAdd * config.refillRateMs);
    }
  }

  async check(
    identifier: string,
    action: string,
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    retryAfterMs: number;
  }> {
    const key = this.getKey(identifier, action);
    const config = this.getConfig(action);

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: config.maxTokens,
        lastRefill: new Date(),
      };
      this.buckets.set(key, bucket);
    }

    this.refillBucket(bucket, config);

    const allowed = bucket.tokens > 0;
    const remaining = Math.max(0, bucket.tokens - (allowed ? 1 : 0));
    const resetAt = new Date(bucket.lastRefill.getTime() + config.refillRateMs);
    const retryAfterMs = allowed ? 0 : resetAt.getTime() - Date.now();

    return { allowed, remaining, resetAt, retryAfterMs };
  }

  async consume(identifier: string, action: string): Promise<void> {
    const key = this.getKey(identifier, action);
    const config = this.getConfig(action);

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: config.maxTokens,
        lastRefill: new Date(),
      };
      this.buckets.set(key, bucket);
    }

    this.refillBucket(bucket, config);

    if (bucket.tokens > 0) {
      bucket.tokens--;
    }
  }

  async reset(identifier: string, action: string): Promise<void> {
    const key = this.getKey(identifier, action);
    this.buckets.delete(key);
  }
}
