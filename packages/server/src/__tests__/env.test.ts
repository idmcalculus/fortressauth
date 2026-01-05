import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Environment configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Set required BASE_URL for all tests
    process.env.BASE_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars are not set', async () => {
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.DATABASE_URL;
    delete process.env.COOKIE_SECURE;
    delete process.env.CSRF_COOKIE_NAME;
    delete process.env.CSRF_COOKIE_SECURE;
    delete process.env.CSRF_COOKIE_SAMESITE;
    delete process.env.CSRF_COOKIE_DOMAIN;
    delete process.env.CSRF_HEADER_NAME;
    delete process.env.CSRF_TOKEN_TTL_MS;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM_ADDRESS;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.SES_REGION;
    delete process.env.SES_ACCESS_KEY_ID;
    delete process.env.SES_SECRET_ACCESS_KEY;
    delete process.env.SES_SESSION_TOKEN;
    delete process.env.SES_FROM_ADDRESS;
    delete process.env.SES_FROM_NAME;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_FROM_ADDRESS;
    delete process.env.SENDGRID_FROM_NAME;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM_ADDRESS;
    delete process.env.SMTP_FROM_NAME;
    delete process.env.SMTP_TLS_REJECT_UNAUTHORIZED;
    delete process.env.SMTP_TLS_SERVERNAME;
    delete process.env.BREACHED_PASSWORD_CHECK;
    delete process.env.BREACHED_PASSWORD_API_URL;
    delete process.env.BREACHED_PASSWORD_TIMEOUT_MS;
    delete process.env.LOG_LEVEL;
    delete (process.env as Record<string, string | undefined>).NODE_ENV;

    const { env } = await import('../env.js');

    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.DATABASE_URL).toBe('./fortress.db');
    expect(env.COOKIE_SECURE).toBe(false); // Not production
    expect(env.CSRF_COOKIE_NAME).toBe('fortress_csrf');
    expect(env.CSRF_COOKIE_SECURE).toBe(false); // Not production
    expect(env.CSRF_COOKIE_SAMESITE).toBe('lax');
    expect(env.CSRF_COOKIE_DOMAIN).toBeUndefined();
    expect(env.CSRF_HEADER_NAME).toBe('x-csrf-token');
    expect(env.CSRF_TOKEN_TTL_MS).toBe(2 * 60 * 60 * 1000);
    expect(env.EMAIL_PROVIDER).toBe('console');
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_FROM_ADDRESS).toBeUndefined();
    expect(env.EMAIL_FROM_NAME).toBeUndefined();
    expect(env.SES_REGION).toBeUndefined();
    expect(env.SES_ACCESS_KEY_ID).toBeUndefined();
    expect(env.SES_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.SES_SESSION_TOKEN).toBeUndefined();
    expect(env.SES_FROM_ADDRESS).toBeUndefined();
    expect(env.SES_FROM_NAME).toBeUndefined();
    expect(env.SENDGRID_API_KEY).toBeUndefined();
    expect(env.SENDGRID_FROM_ADDRESS).toBeUndefined();
    expect(env.SENDGRID_FROM_NAME).toBeUndefined();
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.SMTP_PORT).toBeUndefined();
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASS).toBeUndefined();
    expect(env.SMTP_FROM_ADDRESS).toBeUndefined();
    expect(env.SMTP_FROM_NAME).toBeUndefined();
    expect(env.SMTP_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    expect(env.SMTP_TLS_SERVERNAME).toBeUndefined();
    expect(env.BREACHED_PASSWORD_CHECK).toBe(false);
    expect(env.BREACHED_PASSWORD_API_URL).toBe('https://api.pwnedpasswords.com');
    expect(env.BREACHED_PASSWORD_TIMEOUT_MS).toBe(5000);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('should parse PORT as number', async () => {
    process.env.PORT = '8080';

    const { env } = await import('../env.js');

    expect(env.PORT).toBe(8080);
  });

  it('should parse COOKIE_SECURE as boolean', async () => {
    process.env.COOKIE_SECURE = 'true';

    const { env } = await import('../env.js');

    expect(env.COOKIE_SECURE).toBe(true);
  });

  it('should set COOKIE_SECURE to true in production', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete (process.env as Record<string, string | undefined>).COOKIE_SECURE;

    const { env } = await import('../env.js');

    expect(env.COOKIE_SECURE).toBe(true);
  });

  it('should use custom DATABASE_URL', async () => {
    process.env.DATABASE_URL = '/data/custom.db';

    const { env } = await import('../env.js');

    expect(env.DATABASE_URL).toBe('/data/custom.db');
  });

  it('should accept valid LOG_LEVEL values', async () => {
    process.env.LOG_LEVEL = 'debug';

    const { env } = await import('../env.js');

    expect(env.LOG_LEVEL).toBe('debug');
  });
});
