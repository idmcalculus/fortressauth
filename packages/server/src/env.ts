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
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? isProduction : val === 'true')),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .optional()
    .transform((val) => val ?? 'info'),
});

export const env = envSchema.parse(process.env);
