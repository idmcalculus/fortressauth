import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// Default values as constants for reuse
const SESSION_DEFAULTS = {
  ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  cookieName: 'fortress_session',
  cookieSecure: true,
  cookieSameSite: 'strict' as const,
  cookieDomain: undefined as string | undefined,
};

const BREACHED_PASSWORD_DEFAULTS = {
  enabled: false,
  apiUrl: 'https://api.pwnedpasswords.com',
  timeoutMs: 5000,
};

const PASSWORD_DEFAULTS = {
  minLength: 8,
  maxLength: 128,
  breachedCheck: BREACHED_PASSWORD_DEFAULTS,
};

const RATE_LIMIT_LOGIN_DEFAULTS = {
  maxTokens: 5,
  refillRateMs: 3 * 60 * 1000, // 3 minutes
  windowMs: 15 * 60 * 1000, // 15 minutes
};

const RATE_LIMIT_SIGNUP_DEFAULTS = {
  maxTokens: 5,
  refillRateMs: 3 * 60 * 1000, // 3 minutes
  windowMs: 15 * 60 * 1000, // 15 minutes
};

const RATE_LIMIT_PASSWORD_RESET_DEFAULTS = {
  maxTokens: 5,
  refillRateMs: 3 * 60 * 1000, // 3 minutes
  windowMs: 15 * 60 * 1000, // 15 minutes
};

const RATE_LIMIT_VERIFY_EMAIL_DEFAULTS = {
  maxTokens: 5,
  refillRateMs: 3 * 60 * 1000, // 3 minutes
  windowMs: 15 * 60 * 1000, // 15 minutes
};

const RATE_LIMIT_DEFAULTS = {
  enabled: true,
  backend: 'memory' as const,
  login: RATE_LIMIT_LOGIN_DEFAULTS,
  signup: RATE_LIMIT_SIGNUP_DEFAULTS,
  passwordReset: RATE_LIMIT_PASSWORD_RESET_DEFAULTS,
  verifyEmail: RATE_LIMIT_VERIFY_EMAIL_DEFAULTS,
};

const LOCKOUT_DEFAULTS = {
  enabled: true,
  maxFailedAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
};

const EMAIL_VERIFICATION_DEFAULTS = {
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
};

const PASSWORD_RESET_DEFAULTS = {
  ttlMs: 60 * 60 * 1000, // 1 hour
  maxActiveTokens: 3,
};

const URL_DEFAULTS = {
  baseUrl: 'http://localhost:3000',
};

const OAUTH_DEFAULTS = {
  providers: {} as {
    google?: z.infer<typeof GoogleOAuthSchema>;
    github?: z.infer<typeof GitHubOAuthSchema>;
    apple?: z.infer<typeof AppleOAuthSchema>;
    discord?: z.infer<typeof DiscordOAuthSchema>;
    linkedin?: z.infer<typeof LinkedInOAuthSchema>;
    twitter?: z.infer<typeof TwitterOAuthSchema>;
    microsoft?: z.infer<typeof MicrosoftOAuthSchema>;
  },
};

const SessionConfigSchema = z
  .object({
    ttlMs: z.number().positive().optional(),
    cookieName: z.string().optional(),
    cookieSecure: z.boolean().optional(),
    cookieSameSite: z.enum(['strict', 'lax', 'none']).optional(),
    cookieDomain: z.string().optional(),
  })
  .transform((val) => ({
    ttlMs: val.ttlMs ?? SESSION_DEFAULTS.ttlMs,
    cookieName: val.cookieName ?? SESSION_DEFAULTS.cookieName,
    cookieSecure: val.cookieSecure ?? SESSION_DEFAULTS.cookieSecure,
    cookieSameSite: val.cookieSameSite ?? SESSION_DEFAULTS.cookieSameSite,
    cookieDomain: val.cookieDomain ?? SESSION_DEFAULTS.cookieDomain,
  }))
  .openapi('SessionConfig');

const BreachedPasswordConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    apiUrl: z.url().optional(),
    timeoutMs: z.number().positive().optional(),
  })
  .transform((val) => ({
    enabled: val.enabled ?? BREACHED_PASSWORD_DEFAULTS.enabled,
    apiUrl: val.apiUrl ?? BREACHED_PASSWORD_DEFAULTS.apiUrl,
    timeoutMs: val.timeoutMs ?? BREACHED_PASSWORD_DEFAULTS.timeoutMs,
  }))
  .openapi('BreachedPasswordConfig');

const PasswordConfigSchema = z
  .object({
    minLength: z.number().min(8).optional(),
    maxLength: z.number().max(128).optional(),
    breachedCheck: BreachedPasswordConfigSchema.optional(),
  })
  .transform((val) => ({
    minLength: val.minLength ?? PASSWORD_DEFAULTS.minLength,
    maxLength: val.maxLength ?? PASSWORD_DEFAULTS.maxLength,
    breachedCheck: val.breachedCheck ?? PASSWORD_DEFAULTS.breachedCheck,
  }))
  .openapi('PasswordConfig');

const RateLimitActionConfigSchema = z
  .object({
    maxTokens: z.number().positive().optional(),
    refillRateMs: z.number().positive().optional(),
    windowMs: z.number().positive().optional(),
  })
  .openapi('RateLimitActionConfig');

const applyRateLimitDefaults = (
  value: z.input<typeof RateLimitActionConfigSchema> | undefined,
  defaults: { maxTokens: number; refillRateMs: number; windowMs: number },
) => ({
  maxTokens: value?.maxTokens ?? defaults.maxTokens,
  refillRateMs: value?.refillRateMs ?? defaults.refillRateMs,
  windowMs: value?.windowMs ?? defaults.windowMs,
});

const RateLimitConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    backend: z.enum(['memory', 'redis']).optional(),
    login: RateLimitActionConfigSchema.optional(),
    signup: RateLimitActionConfigSchema.optional(),
    passwordReset: RateLimitActionConfigSchema.optional(),
    verifyEmail: RateLimitActionConfigSchema.optional(),
  })
  .transform((val) => ({
    enabled: val.enabled ?? RATE_LIMIT_DEFAULTS.enabled,
    backend: val.backend ?? RATE_LIMIT_DEFAULTS.backend,
    login: applyRateLimitDefaults(val.login, RATE_LIMIT_LOGIN_DEFAULTS),
    signup: applyRateLimitDefaults(val.signup, RATE_LIMIT_SIGNUP_DEFAULTS),
    passwordReset: applyRateLimitDefaults(val.passwordReset, RATE_LIMIT_PASSWORD_RESET_DEFAULTS),
    verifyEmail: applyRateLimitDefaults(val.verifyEmail, RATE_LIMIT_VERIFY_EMAIL_DEFAULTS),
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

const EmailVerificationConfigSchema = z
  .object({
    ttlMs: z.number().positive().optional(),
  })
  .transform((val) => ({
    ttlMs: val.ttlMs ?? EMAIL_VERIFICATION_DEFAULTS.ttlMs,
  }))
  .openapi('EmailVerificationConfig');

const PasswordResetConfigSchema = z
  .object({
    ttlMs: z.number().positive().optional(),
    maxActiveTokens: z.number().int().positive().optional(),
  })
  .transform((val) => ({
    ttlMs: val.ttlMs ?? PASSWORD_RESET_DEFAULTS.ttlMs,
    maxActiveTokens: val.maxActiveTokens ?? PASSWORD_RESET_DEFAULTS.maxActiveTokens,
  }))
  .openapi('PasswordResetConfig');

const UrlConfigSchema = z
  .object({
    baseUrl: z.string().url().optional(),
  })
  .transform((val) => ({
    baseUrl: val.baseUrl ?? URL_DEFAULTS.baseUrl,
  }))
  .openapi('UrlConfig');

const GoogleOAuthSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().url(),
});

const GitHubOAuthSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().url(),
});

const AppleOAuthSchema = z.object({
  clientId: z.string(),
  teamId: z.string(),
  keyId: z.string(),
  redirectUri: z.string().url(),
  clientSecret: z.string().optional(),
  privateKey: z.string().optional(),
  clientSecretExpiresIn: z.number().int().positive().optional(),
});

const DiscordOAuthSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().url(),
});

const LinkedInOAuthSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().url(),
});

const TwitterOAuthSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().url(),
});

const MicrosoftOAuthSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().url(),
  tenantId: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});

const OAuthConfigSchema = z
  .object({
    providers: z
      .object({
        google: GoogleOAuthSchema.optional(),
        github: GitHubOAuthSchema.optional(),
        apple: AppleOAuthSchema.optional(),
        discord: DiscordOAuthSchema.optional(),
        linkedin: LinkedInOAuthSchema.optional(),
        twitter: TwitterOAuthSchema.optional(),
        microsoft: MicrosoftOAuthSchema.optional(),
      })
      .optional(),
  })
  .transform((val) => ({
    providers: val.providers ?? OAUTH_DEFAULTS.providers,
  }))
  .openapi('OAuthConfig');

export const FortressConfigSchema = z
  .object({
    session: SessionConfigSchema.optional(),
    password: PasswordConfigSchema.optional(),
    rateLimit: RateLimitConfigSchema.optional(),
    lockout: LockoutConfigSchema.optional(),
    emailVerification: EmailVerificationConfigSchema.optional(),
    passwordReset: PasswordResetConfigSchema.optional(),
    urls: UrlConfigSchema.optional(),
    oauth: OAuthConfigSchema.optional(),
  })
  .transform((val) => ({
    session: val.session ?? SESSION_DEFAULTS,
    password: val.password ?? PASSWORD_DEFAULTS,
    rateLimit: val.rateLimit ?? RATE_LIMIT_DEFAULTS,
    lockout: val.lockout ?? LOCKOUT_DEFAULTS,
    emailVerification: val.emailVerification ?? EMAIL_VERIFICATION_DEFAULTS,
    passwordReset: val.passwordReset ?? PASSWORD_RESET_DEFAULTS,
    urls: val.urls ?? URL_DEFAULTS,
    oauth: val.oauth ?? OAUTH_DEFAULTS,
  }))
  .openapi('FortressConfig');

export type FortressConfig = z.infer<typeof FortressConfigSchema>;
export type FortressConfigInput = z.input<typeof FortressConfigSchema>;
export type BreachedPasswordConfig = z.infer<typeof BreachedPasswordConfigSchema>;
