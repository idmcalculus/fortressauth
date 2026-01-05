import { describe, expect, it } from 'vitest';
import { FortressConfigSchema } from '../../schemas/config.js';

describe('FortressConfigSchema', () => {
  describe('default values', () => {
    it('should provide all defaults when parsing empty object', () => {
      const config = FortressConfigSchema.parse({});

      expect(config.session.ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
      expect(config.session.cookieName).toBe('fortress_session');
      expect(config.session.cookieSecure).toBe(true);
      expect(config.session.cookieSameSite).toBe('strict');

      expect(config.password.minLength).toBe(8);
      expect(config.password.maxLength).toBe(128);
      expect(config.password.breachedCheck.enabled).toBe(false);
      expect(config.password.breachedCheck.apiUrl).toBe('https://api.pwnedpasswords.com');
      expect(config.password.breachedCheck.timeoutMs).toBe(5000);

      expect(config.rateLimit.enabled).toBe(true);
      expect(config.rateLimit.login.maxTokens).toBe(5);
      expect(config.rateLimit.login.refillRateMs).toBe(3 * 60 * 1000);
      expect(config.rateLimit.login.windowMs).toBe(15 * 60 * 1000);
      expect(config.rateLimit.signup.maxTokens).toBe(5);
      expect(config.rateLimit.signup.refillRateMs).toBe(3 * 60 * 1000);
      expect(config.rateLimit.signup.windowMs).toBe(15 * 60 * 1000);
      expect(config.rateLimit.passwordReset.maxTokens).toBe(5);
      expect(config.rateLimit.passwordReset.refillRateMs).toBe(3 * 60 * 1000);
      expect(config.rateLimit.passwordReset.windowMs).toBe(15 * 60 * 1000);
      expect(config.rateLimit.verifyEmail.maxTokens).toBe(5);
      expect(config.rateLimit.verifyEmail.refillRateMs).toBe(3 * 60 * 1000);
      expect(config.rateLimit.verifyEmail.windowMs).toBe(15 * 60 * 1000);

      expect(config.lockout.enabled).toBe(true);
      expect(config.lockout.maxFailedAttempts).toBe(5);
      expect(config.lockout.lockoutDurationMs).toBe(15 * 60 * 1000);

      expect(config.passwordReset.ttlMs).toBe(60 * 60 * 1000);
      expect(config.passwordReset.maxActiveTokens).toBe(3);
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
        }),
      ).toThrow();
    });

    it('should reject maxLength above 128', () => {
      expect(() =>
        FortressConfigSchema.parse({
          password: { maxLength: 200 },
        }),
      ).toThrow();
    });

    it('should allow configuring breached password checks', () => {
      const config = FortressConfigSchema.parse({
        password: {
          breachedCheck: {
            enabled: true,
            apiUrl: 'https://hibp.example.com',
            timeoutMs: 2500,
          },
        },
      });

      expect(config.password.breachedCheck.enabled).toBe(true);
      expect(config.password.breachedCheck.apiUrl).toBe('https://hibp.example.com');
      expect(config.password.breachedCheck.timeoutMs).toBe(2500);
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

    it('should allow custom signup rate limit settings', () => {
      const config = FortressConfigSchema.parse({
        rateLimit: {
          signup: {
            maxTokens: 4,
            refillRateMs: 120000,
            windowMs: 240000,
          },
        },
      });

      expect(config.rateLimit.signup.maxTokens).toBe(4);
      expect(config.rateLimit.signup.refillRateMs).toBe(120000);
      expect(config.rateLimit.signup.windowMs).toBe(240000);
    });

    it('should allow custom password reset rate limit settings', () => {
      const config = FortressConfigSchema.parse({
        rateLimit: {
          passwordReset: {
            maxTokens: 3,
            refillRateMs: 120000,
            windowMs: 300000,
          },
        },
      });

      expect(config.rateLimit.passwordReset.maxTokens).toBe(3);
      expect(config.rateLimit.passwordReset.refillRateMs).toBe(120000);
      expect(config.rateLimit.passwordReset.windowMs).toBe(300000);
    });

    it('should allow custom verify email rate limit settings', () => {
      const config = FortressConfigSchema.parse({
        rateLimit: {
          verifyEmail: {
            maxTokens: 6,
            refillRateMs: 90000,
            windowMs: 180000,
          },
        },
      });

      expect(config.rateLimit.verifyEmail.maxTokens).toBe(6);
      expect(config.rateLimit.verifyEmail.refillRateMs).toBe(90000);
      expect(config.rateLimit.verifyEmail.windowMs).toBe(180000);
    });
  });

  describe('password reset config', () => {
    it('should allow custom password reset TTL and token limit', () => {
      const config = FortressConfigSchema.parse({
        passwordReset: {
          ttlMs: 30 * 60 * 1000,
          maxActiveTokens: 2,
        },
      });

      expect(config.passwordReset.ttlMs).toBe(30 * 60 * 1000);
      expect(config.passwordReset.maxActiveTokens).toBe(2);
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

  describe('urls config', () => {
    it('should provide default baseUrl when urls config is not provided', () => {
      const config = FortressConfigSchema.parse({});

      expect(config.urls.baseUrl).toBe('http://localhost:3000');
    });

    it('should provide default baseUrl when urls config is empty object', () => {
      const config = FortressConfigSchema.parse({
        urls: {},
      });

      expect(config.urls.baseUrl).toBe('http://localhost:3000');
    });

    it('should allow custom baseUrl', () => {
      const config = FortressConfigSchema.parse({
        urls: { baseUrl: 'https://myapp.example.com' },
      });

      expect(config.urls.baseUrl).toBe('https://myapp.example.com');
    });
  });
});
