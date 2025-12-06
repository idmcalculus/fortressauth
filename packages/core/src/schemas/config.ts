import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// Default values as constants for reuse
const SESSION_DEFAULTS = {
  ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  cookieName: 'fortress_session',
  cookieSecure: true,
  cookieSameSite: 'lax' as const,
};

const PASSWORD_DEFAULTS = {
  minLength: 8,
  maxLength: 128,
};

const RATE_LIMIT_LOGIN_DEFAULTS = {
  maxTokens: 5,
  refillRateMs: 3 * 60 * 1000, // 3 minutes
  windowMs: 15 * 60 * 1000, // 15 minutes
};

const RATE_LIMIT_DEFAULTS = {
  enabled: true,
  login: RATE_LIMIT_LOGIN_DEFAULTS,
};

const LOCKOUT_DEFAULTS = {
  enabled: true,
  maxFailedAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
};

const SessionConfigSchema = z
  .object({
    ttlMs: z.number().positive().optional(),
    cookieName: z.string().optional(),
    cookieSecure: z.boolean().optional(),
    cookieSameSite: z.enum(['strict', 'lax', 'none']).optional(),
  })
  .transform((val) => ({
    ttlMs: val.ttlMs ?? SESSION_DEFAULTS.ttlMs,
    cookieName: val.cookieName ?? SESSION_DEFAULTS.cookieName,
    cookieSecure: val.cookieSecure ?? SESSION_DEFAULTS.cookieSecure,
    cookieSameSite: val.cookieSameSite ?? SESSION_DEFAULTS.cookieSameSite,
  }))
  .openapi('SessionConfig');

const PasswordConfigSchema = z
  .object({
    minLength: z.number().min(8).optional(),
    maxLength: z.number().max(128).optional(),
  })
  .transform((val) => ({
    minLength: val.minLength ?? PASSWORD_DEFAULTS.minLength,
    maxLength: val.maxLength ?? PASSWORD_DEFAULTS.maxLength,
  }))
  .openapi('PasswordConfig');

const RateLimitLoginConfigSchema = z
  .object({
    maxTokens: z.number().positive().optional(),
    refillRateMs: z.number().positive().optional(),
    windowMs: z.number().positive().optional(),
  })
  .transform((val) => ({
    maxTokens: val.maxTokens ?? RATE_LIMIT_LOGIN_DEFAULTS.maxTokens,
    refillRateMs: val.refillRateMs ?? RATE_LIMIT_LOGIN_DEFAULTS.refillRateMs,
    windowMs: val.windowMs ?? RATE_LIMIT_LOGIN_DEFAULTS.windowMs,
  }))
  .openapi('RateLimitLoginConfig');

const RateLimitConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    login: RateLimitLoginConfigSchema.optional(),
  })
  .transform((val) => ({
    enabled: val.enabled ?? RATE_LIMIT_DEFAULTS.enabled,
    login: val.login ?? RATE_LIMIT_DEFAULTS.login,
  }))
  .openapi('RateLimitConfig');

const LockoutConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxFailedAttempts: z.number().positive().optional(),
    lockoutDurationMs: z.number().positive().optional(),
  })
  .transform((val) => ({
    enabled: val.enabled ?? LOCKOUT_DEFAULTS.enabled,
    maxFailedAttempts: val.maxFailedAttempts ?? LOCKOUT_DEFAULTS.maxFailedAttempts,
    lockoutDurationMs: val.lockoutDurationMs ?? LOCKOUT_DEFAULTS.lockoutDurationMs,
  }))
  .openapi('LockoutConfig');

export const FortressConfigSchema = z
  .object({
    session: SessionConfigSchema.optional(),
    password: PasswordConfigSchema.optional(),
    rateLimit: RateLimitConfigSchema.optional(),
    lockout: LockoutConfigSchema.optional(),
  })
  .transform((val) => ({
    session: val.session ?? SESSION_DEFAULTS,
    password: val.password ?? PASSWORD_DEFAULTS,
    rateLimit: val.rateLimit ?? RATE_LIMIT_DEFAULTS,
    lockout: val.lockout ?? LOCKOUT_DEFAULTS,
  }))
  .openapi('FortressConfig');

export type FortressConfig = z.infer<typeof FortressConfigSchema>;
export type FortressConfigInput = z.input<typeof FortressConfigSchema>;
