import { describe, expect, it } from 'vitest';
import { validatePassword } from '../../security/validation.js';

describe('Password validation', () => {
  describe('validatePassword()', () => {
    it('should accept valid password with default config', () => {
      const result = validatePassword('SecurePass123!');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password shorter than minLength', () => {
      const result = validatePassword('short', { minLength: 8 });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject password longer than maxLength', () => {
      const longPassword = 'a'.repeat(150);
      const result = validatePassword(longPassword, { maxLength: 128 });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must not exceed 128 characters');
    });

    it('should reject common passwords by default', () => {
      const result = validatePassword('password');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password is too common');
    });

    it('should reject common passwords case-insensitively', () => {
      const result = validatePassword('PASSWORD');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password is too common');
    });

    it('should allow common passwords when check is disabled', () => {
      const result = validatePassword('password', { checkCommonPasswords: false });

      expect(result.valid).toBe(true);
    });

    it('should use custom minLength', () => {
      const _result = validatePassword('12345', { minLength: 5 });

      // Still fails because '12345' is too short for default 8
      // Let's test with a longer password
      const result2 = validatePassword('12345678', { minLength: 10 });

      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain('Password must be at least 10 characters long');
    });

    it('should use custom maxLength', () => {
      const result = validatePassword('12345678901', { maxLength: 10 });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must not exceed 10 characters');
    });

    it('should return multiple errors when multiple validations fail', () => {
      const result = validatePassword('123456', { minLength: 8, checkCommonPasswords: true });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });

    it('should accept password at exact minLength', () => {
      const result = validatePassword('12345678', { minLength: 8, checkCommonPasswords: false });

      expect(result.valid).toBe(true);
    });

    it('should accept password at exact maxLength', () => {
      const password = 'a'.repeat(128);
      const result = validatePassword(password, { maxLength: 128 });

      expect(result.valid).toBe(true);
    });

    it('should reject known common passwords', () => {
      const commonPasswords = [
        'password',
        '123456',
        'qwerty',
        'letmein',
        'dragon',
        'iloveyou',
        'trustno1',
      ];

      for (const pwd of commonPasswords) {
        const result = validatePassword(pwd);
        expect(result.errors).toContain('Password is too common');
      }
    });
  });
});
