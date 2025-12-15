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
    .enum(['console', 'resend'])
    .optional()
    .transform((val) => val ?? 'console'),
  RESEND_API_KEY: z.string().optional().transform((val) => val || undefined),
  EMAIL_FROM_ADDRESS: z.email().optional().or(z.literal('')).transform((val) => val || undefined),
  EMAIL_FROM_NAME: z.string().optional().transform((val) => val || undefined),
});

export const env = envSchema.parse(process.env);
