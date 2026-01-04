import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

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
  DATABASE_URL: z
    .string()
    .optional()
    .transform((val) => val ?? './fortress.db'),
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
});

export const env = envSchema.parse(process.env);
