/**
 * Property-Based Tests for Error Response Factory
 *
 * Feature: fortressauth-platform, Property 22: Production Error Message Safety
 * Validates: Requirements 19.1, 19.5
 *
 * These tests verify that production error responses never contain sensitive
 * information such as stack traces, internal paths, database errors, or
 * user-specific information beyond the error code.
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AuthErrorCode } from '@fortressauth/core';
import {
  ErrorResponseFactory,
  type ProductionErrorResponse,
} from '../../errors/error-response-factory.js';

// All possible AuthErrorCode values
const ALL_ERROR_CODES: AuthErrorCode[] = [
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

// Arbitrary for generating AuthErrorCode values
const authErrorCodeArb = fc.constantFrom(...ALL_ERROR_CODES);

// Arbitrary for generating potentially sensitive detail strings
const sensitiveDetailsArb = fc.oneof(
  // Database errors
  fc.constant('ECONNREFUSED: Connection refused to database'),
  fc.constant('PostgreSQL error: relation "users" does not exist'),
  fc.constant('MySQL error: Access denied for user'),
  fc.constant('SQLite error: database is locked'),
  // File paths
  fc.constant('/Users/developer/projects/fortressauth/src/index.ts:42:15'),
  fc.constant('C:\\Users\\dev\\fortressauth\\node_modules\\pg\\lib\\client.js:123'),
  fc.constant('/var/www/app/packages/server/dist/index.js:100:20'),
  // Stack traces
  fc.constant('Error: Something went wrong\n    at Object.<anonymous> (/app/src/auth.ts:50:11)'),
  fc.constant('TypeError: Cannot read property "id" of undefined\n    at validateSession'),
  // Sensitive data patterns
  fc.constant('Password hash: $argon2id$v=19$m=65536,t=3,p=4$...'),
  fc.constant('Token: abc123def456ghi789jkl012mno345pqr678'),
  fc.constant('User email: user@example.com failed authentication'),
  // Random strings that might contain sensitive info
  fc.string({ minLength: 10, maxLength: 200 }),
);

// Arbitrary for generating Error objects with stack traces
const errorWithStackArb = fc.tuple(fc.string(), fc.string()).map(([message, extraInfo]) => {
  const error = new Error(`${message}: ${extraInfo}`);
  return error;
});

describe('Property 22: Production Error Message Safety', () => {
  const productionFactory = new ErrorResponseFactory({ isProduction: true });

  it('should never expose stack traces in production responses for any error code and details', () => {
    fc.assert(
      fc.property(
        authErrorCodeArb,
        sensitiveDetailsArb,
        errorWithStackArb,
        (errorCode, details, error) => {
          const response = productionFactory.createErrorResponse(errorCode, details, error);
          const responseStr = JSON.stringify(response);

          // Should not contain stack trace patterns
          expect(responseStr).not.toMatch(/at\s+\w+\s*\(/);
          expect(responseStr).not.toMatch(/at\s+Object\./);
          expect(responseStr).not.toMatch(/at\s+Module\./);
          expect(responseStr).not.toMatch(/at\s+async/);

          // Should not have stack property
          expect(response).not.toHaveProperty('stack');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should never expose internal file paths in production responses', () => {
    fc.assert(
      fc.property(
        authErrorCodeArb,
        sensitiveDetailsArb,
        errorWithStackArb,
        (errorCode, details, error) => {
          const response = productionFactory.createErrorResponse(errorCode, details, error);
          const responseStr = JSON.stringify(response);

          // Should not contain file path patterns
          expect(responseStr).not.toMatch(/\.ts:\d+:\d+/);
          expect(responseStr).not.toMatch(/\.js:\d+:\d+/);
          expect(responseStr).not.toMatch(/node_modules/i);
          expect(responseStr).not.toMatch(/\/Users\//i);
          expect(responseStr).not.toMatch(/\/home\//i);
          expect(responseStr).not.toMatch(/\/var\/www/i);
          expect(responseStr).not.toMatch(/C:\\Users\\/i);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should never expose database error details in production responses', () => {
    fc.assert(
      fc.property(
        authErrorCodeArb,
        sensitiveDetailsArb,
        (errorCode, details) => {
          const response = productionFactory.createErrorResponse(errorCode, details);
          const responseStr = JSON.stringify(response).toLowerCase();

          // Should not contain database-specific error patterns
          expect(responseStr).not.toMatch(/econnrefused/i);
          expect(responseStr).not.toMatch(/postgresql error/i);
          expect(responseStr).not.toMatch(/mysql error/i);
          expect(responseStr).not.toMatch(/sqlite error/i);
          expect(responseStr).not.toMatch(/database is locked/i);
          expect(responseStr).not.toMatch(/relation.*does not exist/i);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should never expose sensitive tokens or hashes in production responses', () => {
    fc.assert(
      fc.property(
        authErrorCodeArb,
        sensitiveDetailsArb,
        (errorCode, details) => {
          const response = productionFactory.createErrorResponse(errorCode, details);
          const responseStr = JSON.stringify(response);

          // Should not contain password hash patterns
          expect(responseStr).not.toMatch(/\$argon2/i);
          expect(responseStr).not.toMatch(/\$bcrypt/i);
          expect(responseStr).not.toMatch(/password.*hash/i);

          // Should not have details field in production
          expect(response).not.toHaveProperty('details');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should always include required production response fields', () => {
    fc.assert(
      fc.property(
        authErrorCodeArb,
        sensitiveDetailsArb,
        errorWithStackArb,
        (errorCode, details, error) => {
          const response = productionFactory.createErrorResponse(
            errorCode,
            details,
            error,
          ) as ProductionErrorResponse;

          // Must have required fields
          expect(response.success).toBe(false);
          expect(response.error).toBe(errorCode);
          expect(response.code).toMatch(/^AUTH_\d{3}$/);
          expect(typeof response.message).toBe('string');
          expect(response.message.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should pass containsSensitiveInfo check for all production responses', () => {
    fc.assert(
      fc.property(
        authErrorCodeArb,
        sensitiveDetailsArb,
        errorWithStackArb,
        (errorCode, details, error) => {
          const response = productionFactory.createErrorResponse(errorCode, details, error);

          // Production responses should never contain sensitive info
          expect(ErrorResponseFactory.containsSensitiveInfo(response)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return consistent HTTP status codes for each error type', () => {
    fc.assert(
      fc.property(authErrorCodeArb, (errorCode) => {
        const status1 = productionFactory.getHttpStatus(errorCode);
        const status2 = productionFactory.getHttpStatus(errorCode);

        // Status should be consistent
        expect(status1).toBe(status2);

        // Status should be valid HTTP error code
        expect(status1).toBeGreaterThanOrEqual(400);
        expect(status1).toBeLessThan(600);
      }),
      { numRuns: 100 },
    );
  });
});
