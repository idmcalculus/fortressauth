import { describe, expect, it } from 'vitest';
import { type AuthErrorCode, ERROR_CODE_MAP, getErrorCodeMapping } from '../../types/errors.js';

describe('Error Code Mappings', () => {
  describe('ERROR_CODE_MAP', () => {
    it('should have mappings for all AuthErrorCode values', () => {
      const expectedErrorCodes: AuthErrorCode[] = [
        'INVALID_EMAIL',
        'INVALID_PASSWORD',
        'PASSWORD_TOO_WEAK',
        'INVALID_CREDENTIALS',
        'ACCOUNT_LOCKED',
        'EMAIL_NOT_VERIFIED',
        'EMAIL_VERIFICATION_INVALID',
        'EMAIL_VERIFICATION_EXPIRED',
        'PASSWORD_RESET_INVALID',
        'PASSWORD_RESET_EXPIRED',
        'SESSION_EXPIRED',
        'SESSION_INVALID',
        'EMAIL_EXISTS',
        'RATE_LIMIT_EXCEEDED',
        'INTERNAL_ERROR',
      ];

      for (const errorCode of expectedErrorCodes) {
        expect(ERROR_CODE_MAP[errorCode]).toBeDefined();
        expect(ERROR_CODE_MAP[errorCode].code).toMatch(/^AUTH_\d{3}$/);
        expect(ERROR_CODE_MAP[errorCode].message).toBeTruthy();
        expect(ERROR_CODE_MAP[errorCode].httpStatus).toBeGreaterThanOrEqual(400);
        expect(ERROR_CODE_MAP[errorCode].httpStatus).toBeLessThan(600);
      }
    });

    it('should have unique error codes', () => {
      const codes = Object.values(ERROR_CODE_MAP).map((m) => m.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should have appropriate HTTP status codes', () => {
      // 401 Unauthorized for auth failures
      expect(ERROR_CODE_MAP.INVALID_CREDENTIALS.httpStatus).toBe(401);
      expect(ERROR_CODE_MAP.ACCOUNT_LOCKED.httpStatus).toBe(401);
      expect(ERROR_CODE_MAP.SESSION_INVALID.httpStatus).toBe(401);
      expect(ERROR_CODE_MAP.SESSION_EXPIRED.httpStatus).toBe(401);

      // 400 Bad Request for validation errors
      expect(ERROR_CODE_MAP.EMAIL_EXISTS.httpStatus).toBe(400);
      expect(ERROR_CODE_MAP.PASSWORD_TOO_WEAK.httpStatus).toBe(400);
      expect(ERROR_CODE_MAP.INVALID_EMAIL.httpStatus).toBe(400);
      expect(ERROR_CODE_MAP.INVALID_PASSWORD.httpStatus).toBe(400);

      // 403 Forbidden for email not verified
      expect(ERROR_CODE_MAP.EMAIL_NOT_VERIFIED.httpStatus).toBe(403);

      // 410 Gone for expired tokens
      expect(ERROR_CODE_MAP.EMAIL_VERIFICATION_EXPIRED.httpStatus).toBe(410);
      expect(ERROR_CODE_MAP.PASSWORD_RESET_EXPIRED.httpStatus).toBe(410);

      // 429 Too Many Requests for rate limiting
      expect(ERROR_CODE_MAP.RATE_LIMIT_EXCEEDED.httpStatus).toBe(429);

      // 500 Internal Server Error
      expect(ERROR_CODE_MAP.INTERNAL_ERROR.httpStatus).toBe(500);
    });

    it('should have user-friendly messages without technical details', () => {
      for (const mapping of Object.values(ERROR_CODE_MAP)) {
        // Messages should not contain technical terms
        expect(mapping.message.toLowerCase()).not.toContain('database');
        expect(mapping.message.toLowerCase()).not.toContain('sql');
        expect(mapping.message.toLowerCase()).not.toContain('hash');
        expect(mapping.message.toLowerCase()).not.toContain('token');
        expect(mapping.message.toLowerCase()).not.toContain('internal');
        expect(mapping.message.toLowerCase()).not.toContain('exception');
      }
    });
  });

  describe('getErrorCodeMapping', () => {
    it('should return correct mapping for valid error codes', () => {
      const mapping = getErrorCodeMapping('INVALID_CREDENTIALS');
      expect(mapping.code).toBe('AUTH_001');
      expect(mapping.message).toBe('Authentication failed. Please check your credentials.');
      expect(mapping.httpStatus).toBe(401);
    });

    it('should return INTERNAL_ERROR mapping for unknown error codes', () => {
      // @ts-expect-error - Testing invalid input
      const mapping = getErrorCodeMapping('UNKNOWN_ERROR');
      expect(mapping.code).toBe('AUTH_009');
      expect(mapping.httpStatus).toBe(500);
    });

    it('should return consistent mappings', () => {
      const mapping1 = getErrorCodeMapping('EMAIL_EXISTS');
      const mapping2 = getErrorCodeMapping('EMAIL_EXISTS');
      expect(mapping1).toEqual(mapping2);
    });
  });
});
