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
    delete process.env.LOG_LEVEL;
    delete process.env.NODE_ENV;

    const { env } = await import('../env.js');

    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.DATABASE_URL).toBe('./fortress.db');
    expect(env.COOKIE_SECURE).toBe(false); // Not production
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
    process.env.NODE_ENV = 'production';
    delete process.env.COOKIE_SECURE;

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
