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
  baseUrl: 'https://api.fortressauth.com',
  localBaseUrl: 'http://localhost:3000',
  devBaseUrl: 'https://dev-api.fortressauth.com',
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

const NATIVE_AUTH_DEFAULTS = {
  authorizationCodeTtlMs: 60 * 1000,
  sessionTtlMs: 24 * 60 * 60 * 1000,
  clients: [] as Array<{ clientId: string; redirectUris: string[]; resourceAudiences: string[] }>,
  resourceServers: [] as Array<{
    audience: string;
    enabled: boolean;
    allowedClientIds: string[];
    rateLimit: { maxTokens: number; windowMs: number };
  }>,
};

const RESOURCE_SERVER_RATE_LIMIT_DEFAULTS = {
  maxTokens: 120,
  windowMs: 60_000,
};

const PublicIdentifierSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

const NativeClientConfigSchema = z
  .object({
    clientId: PublicIdentifierSchema.max(128),
    redirectUris: z.array(z.string().url().max(2_048)).min(1).max(16),
    resourceAudiences: z.array(PublicIdentifierSchema).max(32).optional(),
  })
  .strict();

const ResourceServerConfigSchema = z
  .object({
    audience: PublicIdentifierSchema,
    enabled: z.boolean().optional(),
    allowedClientIds: z.array(PublicIdentifierSchema.max(128)).min(1).max(64),
    rateLimit: z
      .object({
        maxTokens: z.number().int().min(1).max(100_000).optional(),
        windowMs: z
          .number()
          .int()
          .min(1_000)
          .max(24 * 60 * 60 * 1000)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

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

const NativeAuthConfigSchema = z
  .object({
    authorizationCodeTtlMs: z
      .number()
      .int()
      .min(10_000)
      .max(5 * 60 * 1000)
      .optional(),
    sessionTtlMs: z
      .number()
      .int()
      .min(5 * 60 * 1000)
      .max(30 * 24 * 60 * 60 * 1000)
      .optional(),
    clients: z.array(NativeClientConfigSchema).max(128).optional(),
    resourceServers: z.array(ResourceServerConfigSchema).max(128).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const clients = val.clients ?? [];
    const resourceServers = val.resourceServers ?? [];
    const clientIds = new Set<string>();
    for (const [index, client] of clients.entries()) {
      if (clientIds.has(client.clientId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['clients', index, 'clientId'],
          message: 'native client ids must be unique',
        });
      }
      clientIds.add(client.clientId);
      if (new Set(client.redirectUris).size !== client.redirectUris.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['clients', index, 'redirectUris'],
          message: 'redirect URIs must be unique',
        });
      }
      const audiences = client.resourceAudiences ?? [];
      if (new Set(audiences).size !== audiences.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['clients', index, 'resourceAudiences'],
          message: 'resource audiences must be unique',
        });
      }
    }
    const audienceSet = new Set<string>();
    for (const [index, resource] of resourceServers.entries()) {
      if (audienceSet.has(resource.audience)) {
        ctx.addIssue({
          code: 'custom',
          path: ['resourceServers', index, 'audience'],
          message: 'resource-server audiences must be unique',
        });
      }
      audienceSet.add(resource.audience);
      for (const clientId of resource.allowedClientIds) {
        const client = clients.find((candidate) => candidate.clientId === clientId);
        if (!client || !(client.resourceAudiences ?? []).includes(resource.audience)) {
          ctx.addIssue({
            code: 'custom',
            path: ['resourceServers', index, 'allowedClientIds'],
            message: `client ${clientId} must grant audience ${resource.audience}`,
          });
        }
      }
    }
    for (const [index, client] of clients.entries()) {
      for (const audience of client.resourceAudiences ?? []) {
        if (!audienceSet.has(audience)) {
          ctx.addIssue({
            code: 'custom',
            path: ['clients', index, 'resourceAudiences'],
            message: `resource audience ${audience} is not registered`,
          });
        }
      }
    }
  })
  .transform((val) => ({
    authorizationCodeTtlMs:
      val.authorizationCodeTtlMs ?? NATIVE_AUTH_DEFAULTS.authorizationCodeTtlMs,
    sessionTtlMs: val.sessionTtlMs ?? NATIVE_AUTH_DEFAULTS.sessionTtlMs,
    clients: (val.clients ?? NATIVE_AUTH_DEFAULTS.clients).map((client) => ({
      ...client,
      resourceAudiences: client.resourceAudiences ?? [],
    })),
    resourceServers: (val.resourceServers ?? NATIVE_AUTH_DEFAULTS.resourceServers).map(
      (resource) => ({
        audience: resource.audience,
        enabled: resource.enabled ?? true,
        allowedClientIds: resource.allowedClientIds,
        rateLimit: {
          maxTokens: resource.rateLimit?.maxTokens ?? RESOURCE_SERVER_RATE_LIMIT_DEFAULTS.maxTokens,
          windowMs: resource.rateLimit?.windowMs ?? RESOURCE_SERVER_RATE_LIMIT_DEFAULTS.windowMs,
        },
      }),
    ),
  }))
  .openapi('NativeAuthConfig');

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
    nativeAuth: NativeAuthConfigSchema.optional(),
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
    nativeAuth: val.nativeAuth ?? NATIVE_AUTH_DEFAULTS,
  }))
  .openapi('FortressConfig');

export type FortressConfig = z.infer<typeof FortressConfigSchema>;
export type FortressConfigInput = z.input<typeof FortressConfigSchema>;
export type BreachedPasswordConfig = z.infer<typeof BreachedPasswordConfigSchema>;
