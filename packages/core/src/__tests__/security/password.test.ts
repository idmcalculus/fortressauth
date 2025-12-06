import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../security/password.js';

describe('Password security', () => {
  describe('hashPassword()', () => {
    it('should hash a password', async () => {
      const hash = await hashPassword('SecurePassword123!');

      expect(hash).toBeDefined();
      expect(hash).not.toBe('SecurePassword123!');
      expect(hash.startsWith('$argon2')).toBe(true);
    });

    it('should generate different hashes for same password', async () => {
      const hash1 = await hashPassword('SamePassword');
      const hash2 = await hashPassword('SamePassword');

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different passwords', async () => {
      const hash1 = await hashPassword('Password1');
      const hash2 = await hashPassword('Password2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword()', () => {
    it('should return true for correct password', async () => {
      const password = 'CorrectPassword123!';
      const hash = await hashPassword(password);

      const result = await verifyPassword(hash, password);

      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hash = await hashPassword('CorrectPassword');

      const result = await verifyPassword(hash, 'WrongPassword');

      expect(result).toBe(false);
    });

    it('should return false for invalid hash', async () => {
      const result = await verifyPassword('invalid-hash', 'password');

      expect(result).toBe(false);
    });

    it('should return false for empty hash', async () => {
      const result = await verifyPassword('', 'password');

      expect(result).toBe(false);
    });

    it('should handle special characters in password', async () => {
      const password = 'P@$$w0rd!#$%^&*()_+-=[]{}|;:,.<>?';
      const hash = await hashPassword(password);

      expect(await verifyPassword(hash, password)).toBe(true);
    });

    it('should handle unicode characters in password', async () => {
      const password = 'Пароль密码🔐';
      const hash = await hashPassword(password);

      expect(await verifyPassword(hash, password)).toBe(true);
    });
  });
});
