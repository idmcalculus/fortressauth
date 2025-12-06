import { describe, expect, it } from 'vitest';
import { FortressConfigSchema } from '../../schemas/config.js';

describe('FortressConfigSchema', () => {
  describe('default values', () => {
    it('should provide all defaults when parsing empty object', () => {
      const config = FortressConfigSchema.parse({});

      expect(config.session.ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
      expect(config.session.cookieName).toBe('fortress_session');
      expect(config.session.cookieSecure).toBe(true);
      expect(config.session.cookieSameSite).toBe('lax');

      expect(config.password.minLength).toBe(8);
      expect(config.password.maxLength).toBe(128);

      expect(config.rateLimit.enabled).toBe(true);
      expect(config.rateLimit.login.maxTokens).toBe(5);
      expect(config.rateLimit.login.refillRateMs).toBe(3 * 60 * 1000);
      expect(config.rateLimit.login.windowMs).toBe(15 * 60 * 1000);

      expect(config.lockout.enabled).toBe(true);
      expect(config.lockout.maxFailedAttempts).toBe(5);
      expect(config.lockout.lockoutDurationMs).toBe(15 * 60 * 1000);
    });
  });

  describe('session config', () => {
    it('should allow custom session TTL', () => {
      const config = FortressConfigSchema.parse({
        session: { ttlMs: 3600000 },
      });

      expect(config.session.ttlMs).toBe(3600000);
      expect(config.session.cookieName).toBe('fortress_session'); // default
    });

    it('should allow custom cookie name', () => {
      const config = FortressConfigSchema.parse({
        session: { cookieName: 'my_session' },
      });

      expect(config.session.cookieName).toBe('my_session');
    });

    it('should allow cookieSecure to be false', () => {
      const config = FortressConfigSchema.parse({
        session: { cookieSecure: false },
      });

      expect(config.session.cookieSecure).toBe(false);
    });

    it('should allow different sameSite values', () => {
      const strictConfig = FortressConfigSchema.parse({
        session: { cookieSameSite: 'strict' },
      });
      expect(strictConfig.session.cookieSameSite).toBe('strict');

      const noneConfig = FortressConfigSchema.parse({
        session: { cookieSameSite: 'none' },
      });
      expect(noneConfig.session.cookieSameSite).toBe('none');
    });
  });

  describe('password config', () => {
    it('should allow custom minLength', () => {
      const config = FortressConfigSchema.parse({
        password: { minLength: 12 },
      });

      expect(config.password.minLength).toBe(12);
    });

    it('should allow custom maxLength', () => {
      const config = FortressConfigSchema.parse({
        password: { maxLength: 64 },
      });

      expect(config.password.maxLength).toBe(64);
    });

    it('should reject minLength below 8', () => {
      expect(() =>
        FortressConfigSchema.parse({
          password: { minLength: 5 },
        })
      ).toThrow();
    });

    it('should reject maxLength above 128', () => {
      expect(() =>
        FortressConfigSchema.parse({
          password: { maxLength: 200 },
        })
      ).toThrow();
    });
  });

  describe('rateLimit config', () => {
    it('should allow disabling rate limiting', () => {
      const config = FortressConfigSchema.parse({
        rateLimit: { enabled: false },
      });

      expect(config.rateLimit.enabled).toBe(false);
    });

    it('should allow custom login rate limit settings', () => {
      const config = FortressConfigSchema.parse({
        rateLimit: {
          login: {
            maxTokens: 10,
            refillRateMs: 60000,
            windowMs: 600000,
          },
        },
      });

      expect(config.rateLimit.login.maxTokens).toBe(10);
      expect(config.rateLimit.login.refillRateMs).toBe(60000);
      expect(config.rateLimit.login.windowMs).toBe(600000);
    });
  });

  describe('lockout config', () => {
    it('should allow disabling lockout', () => {
      const config = FortressConfigSchema.parse({
        lockout: { enabled: false },
      });

      expect(config.lockout.enabled).toBe(false);
    });

    it('should allow custom lockout settings', () => {
      const config = FortressConfigSchema.parse({
        lockout: {
          maxFailedAttempts: 3,
          lockoutDurationMs: 30 * 60 * 1000,
        },
      });

      expect(config.lockout.maxFailedAttempts).toBe(3);
      expect(config.lockout.lockoutDurationMs).toBe(30 * 60 * 1000);
    });
  });

  describe('partial config', () => {
    it('should merge partial config with defaults', () => {
      const config = FortressConfigSchema.parse({
        session: { cookieSecure: false },
        lockout: { enabled: false },
      });

      // Custom values
      expect(config.session.cookieSecure).toBe(false);
      expect(config.lockout.enabled).toBe(false);

      // Defaults preserved
      expect(config.session.ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
      expect(config.rateLimit.enabled).toBe(true);
    });
  });
});
