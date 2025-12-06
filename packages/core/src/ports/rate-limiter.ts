export interface RateLimiterPort {
  check(
    identifier: string,
    action: string,
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    retryAfterMs: number;
  }>;

  consume(identifier: string, action: string): Promise<void>;

  reset(identifier: string, action: string): Promise<void>;
}
