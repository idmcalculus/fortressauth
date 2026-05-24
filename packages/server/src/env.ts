import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';
const defaultSqlitePath = resolve(dirname(fileURLToPath(import.meta.url)), '../fortress.db');

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
