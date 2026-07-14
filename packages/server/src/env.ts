import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';
const defaultSqlitePath = resolve(dirname(fileURLToPath(import.meta.url)), '../fortress.db');
const publicIdentifierSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const redirectUriSchema = z.string().url().max(2_048);
const resourceCredentialSecretSchema = z
  .string()
  .min(43)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/, 'must be an unpadded base64url or hexadecimal secret');

const nativeClientsSchema = z.array(
  z
    .object({
      clientId: publicIdentifierSchema.max(128),
      redirectUris: z.array(redirectUriSchema).min(1).max(16),
      resourceAudiences: z.array(publicIdentifierSchema).max(32).optional(),
    })
    .strict(),
);

const resourceServersSchema = z.array(
  z
    .object({
      audience: publicIdentifierSchema,
      enabled: z.boolean().optional(),
      allowedClientIds: z.array(publicIdentifierSchema.max(128)).min(1).max(64),
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
    .strict(),
);

const resourceServerCredentialsSchema = z
  .array(
    z
      .object({
        audience: publicIdentifierSchema,
        credentials: z
          .array(
            z
              .object({
                credentialId: publicIdentifierSchema.max(128),
                secret: resourceCredentialSecretSchema,
                enabled: z.boolean().optional(),
              })
              .strict(),
          )
          .min(1)
          .max(4),
      })
      .strict(),
  )
  .superRefine((resources, ctx) => {
    const audiences = new Set<string>();
    const credentialIds = new Set<string>();
    for (const [resourceIndex, resource] of resources.entries()) {
      if (audiences.has(resource.audience)) {
        ctx.addIssue({
          code: 'custom',
          path: [resourceIndex, 'audience'],
          message: 'resource credential audiences must be unique',
        });
      }
      audiences.add(resource.audience);
      for (const [credentialIndex, credential] of resource.credentials.entries()) {
        if (credentialIds.has(credential.credentialId)) {
          ctx.addIssue({
            code: 'custom',
            path: [resourceIndex, 'credentials', credentialIndex, 'credentialId'],
            message: 'resource credential ids must be globally unique',
          });
        }
        credentialIds.add(credential.credentialId);
      }
    }
  });

const envSchema = z.object({
  PORT: z.coerce
    .number()
    .positive()
    .optional()
    .transform((val) => val ?? 3000),
  HOST: z
    .string()
    .optional()
    .transform((val) => val ?? '0.0.0.0'),
  STRICT_PORT: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  DATABASE_URL: z
    .string()
    .optional()
    .transform((val) => val ?? defaultSqlitePath),
  BASE_URL: z
    .string()
    .url()
    .optional()
    .transform((val) => val ?? 'http://localhost:3000'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? isProduction : val === 'true')),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z
    .enum(['strict', 'lax', 'none'])
    .optional()
    .transform((val) => val ?? 'strict'),
  CSRF_COOKIE_NAME: z
    .string()
    .optional()
    .transform((val) => val ?? 'fortress_csrf'),
  CSRF_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? isProduction : val === 'true')),
  CSRF_COOKIE_SAMESITE: z
    .enum(['strict', 'lax', 'none'])
    .optional()
    .transform((val) => val ?? 'lax'),
  CSRF_COOKIE_DOMAIN: z.string().optional(),
  CSRF_HEADER_NAME: z
    .string()
    .optional()
    .transform((val) => val ?? 'x-csrf-token'),
  CSRF_TOKEN_TTL_MS: z.coerce
    .number()
    .positive()
    .optional()
    .transform((val) => val ?? 2 * 60 * 60 * 1000),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .optional()
    .transform((val) => val ?? 'info'),
  REDIS_URL: z.string().optional(),
  TRUSTED_PROXY_HOP_COUNT: z.coerce
    .number()
    .int()
    .min(0)
    .max(8)
    .optional()
    .transform((val) => val ?? 0),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((val) =>
      val
        ? val
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : null,
    ),
  METRICS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? true : val === 'true')),
  EMAIL_PROVIDER: z
    .enum(['console', 'resend', 'ses', 'sendgrid', 'smtp'])
    .optional()
    .transform((val) => val ?? 'console'),
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  EMAIL_FROM_ADDRESS: z
    .email()
    .optional()
    .or(z.literal(''))
    .transform((val) => val || undefined),
  EMAIL_FROM_NAME: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SES_REGION: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SES_ACCESS_KEY_ID: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SES_SECRET_ACCESS_KEY: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SES_SESSION_TOKEN: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SES_FROM_ADDRESS: z
    .email()
    .optional()
    .or(z.literal(''))
    .transform((val) => val || undefined),
  SES_FROM_NAME: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SES_CONFIGURATION_SET_NAME: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SENDGRID_API_KEY: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SENDGRID_FROM_ADDRESS: z
    .email()
    .optional()
    .or(z.literal(''))
    .transform((val) => val || undefined),
  SENDGRID_FROM_NAME: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SMTP_HOST: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SMTP_PORT: z.coerce
    .number()
    .positive()
    .optional()
    .transform((val) => val ?? undefined),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  SMTP_USER: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SMTP_PASS: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SMTP_FROM_ADDRESS: z
    .email()
    .optional()
    .or(z.literal(''))
    .transform((val) => val || undefined),
  SMTP_FROM_NAME: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  SMTP_TLS_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
  SMTP_TLS_SERVERNAME: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  BREACHED_PASSWORD_CHECK: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  BREACHED_PASSWORD_API_URL: z
    .string()
    .url()
    .optional()
    .transform((val) => val ?? 'https://api.pwnedpasswords.com'),
  BREACHED_PASSWORD_TIMEOUT_MS: z.coerce
    .number()
    .positive()
    .optional()
    .transform((val) => val ?? 5000),

  NATIVE_CLIENT_ID: z.string().min(1).max(128).optional(),
  NATIVE_REDIRECT_URIS: z
    .string()
    .optional()
    .transform((val) =>
      val
        ? val
            .split(',')
            .map((uri) => uri.trim())
            .filter(Boolean)
        : [],
    ),
  NATIVE_CLIENTS_JSON: z
    .string()
    .optional()
    .transform((val, ctx) => {
      if (!val) return [];
      try {
        const parsed = nativeClientsSchema.safeParse(JSON.parse(val));
        if (parsed.success) return parsed.data;
        ctx.addIssue({ code: 'custom', message: 'must be a valid native client registry' });
        return z.NEVER;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be valid JSON' });
        return z.NEVER;
      }
    }),
  NATIVE_AUTHORIZATION_CODE_TTL_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(5 * 60 * 1000)
    .optional()
    .transform((val) => val ?? 60_000),
  NATIVE_SESSION_TTL_MS: z.coerce
    .number()
    .int()
    .min(5 * 60 * 1000)
    .max(30 * 24 * 60 * 60 * 1000)
    .optional()
    .transform((val) => val ?? 24 * 60 * 60 * 1000),
  RESOURCE_SERVERS_JSON: z
    .string()
    .optional()
    .transform((val, ctx) => {
      if (!val) return [];
      try {
        const parsed = resourceServersSchema.safeParse(JSON.parse(val));
        if (parsed.success) return parsed.data;
        ctx.addIssue({ code: 'custom', message: 'must be a valid resource-server registry' });
        return z.NEVER;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be valid JSON' });
        return z.NEVER;
      }
    }),
  RESOURCE_SERVER_CREDENTIALS_JSON: z
    .string()
    .optional()
    .transform((val, ctx) => {
      if (!val) return [];
      try {
        const parsed = resourceServerCredentialsSchema.safeParse(JSON.parse(val));
        if (!parsed.success) {
          ctx.addIssue({ code: 'custom', message: 'must contain valid resource credentials' });
          return z.NEVER;
        }
        return parsed.data.map((resource) => ({
          audience: resource.audience,
          credentials: resource.credentials.map((credential) => ({
            credentialId: credential.credentialId,
            enabled: credential.enabled ?? true,
            verifierHash: createHash('sha256').update(credential.secret).digest('hex'),
          })),
        }));
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be valid JSON' });
        return z.NEVER;
      }
    }),
  RESOURCE_INTROSPECTION_GLOBAL_MAX_TOKENS: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .optional()
    .transform((val) => val ?? 2_000),
  RESOURCE_INTROSPECTION_GLOBAL_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(24 * 60 * 60 * 1000)
    .optional()
    .transform((val) => val ?? 60_000),
  RESOURCE_INTROSPECTION_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(256)
    .max(16_384)
    .optional()
    .transform((val) => val ?? 1_024),
  RESOURCE_INTROSPECTION_AUDIT_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3_650)
    .optional()
    .transform((val) => val ?? 90),

  // OAuth Providers
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_REDIRECT_URI: z.string().url().optional(),

  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_REDIRECT_URI: z.string().url().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),
  APPLE_PRIVATE_KEY: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  APPLE_CLIENT_SECRET_TTL_SECONDS: z.coerce.number().positive().optional(),

  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_REDIRECT_URI: z.string().url().optional(),

  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_REDIRECT_URI: z.string().url().optional(),

  TWITTER_CLIENT_ID: z.string().optional(),
  TWITTER_CLIENT_SECRET: z.string().optional(),
  TWITTER_REDIRECT_URI: z.string().url().optional(),

  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),
  MICROSOFT_SCOPES: z
    .string()
    .optional()
    .transform((val) =>
      val
        ? val
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : undefined,
    ),
});

export const env = (() => {
  const result = envSchema.safeParse(process.env);
  if (result.success) {
    delete process.env.RESOURCE_SERVER_CREDENTIALS_JSON;
    return result.data;
  }

  // Format Zod errors into a developer-friendly summary instead of dumping
  // a multi-screen JSON tree to stderr. Each line lists the offending
  // variable and the reason; this is what an operator actually wants to see
  // when their container fails to start.
  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  console.error('[fortressauth] Invalid environment configuration:');
  for (const line of lines) {
    console.error(line);
  }
  console.error(
    '[fortressauth] Fix the variables above (commonly in .env or your container env) and restart.',
  );
  process.exit(1);
})();
