import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type DevelopmentErrorResponse,
  ErrorResponseFactory,
  type ProductionErrorResponse,
} from '../../errors/error-response-factory.js';

describe('ErrorResponseFactory', () => {
  describe('Production Mode', () => {
    let factory: ErrorResponseFactory;

    beforeEach(() => {
      factory = new ErrorResponseFactory({ isProduction: true });
    });

    it('should create production-safe error responses', () => {
      const response = factory.createErrorResponse('INVALID_CREDENTIALS');

      expect(response.success).toBe(false);
      expect(response.error).toBe('INVALID_CREDENTIALS');
      expect((response as ProductionErrorResponse).message).toBe(
        'Authentication failed. Please check your credentials.',
      );
      expect((response as ProductionErrorResponse).code).toBe('AUTH_001');
    });

    it('should not include details in production mode', () => {
      const response = factory.createErrorResponse(
        'INTERNAL_ERROR',
        'Database connection failed: ECONNREFUSED',
      );

      expect(response).not.toHaveProperty('details');
      expect(response).not.toHaveProperty('stack');
      expect(response).not.toHaveProperty('timestamp');
    });

    it('should not include stack traces in production mode', () => {
      const error = new Error('Something went wrong');
      const response = factory.createErrorResponse('INTERNAL_ERROR', 'Error details', error);

      expect(response).not.toHaveProperty('stack');
      expect(JSON.stringify(response)).not.toContain('at ');
    });

    it('should return correct HTTP status codes', () => {
      expect(factory.getHttpStatus('INVALID_CREDENTIALS')).toBe(401);
      expect(factory.getHttpStatus('EMAIL_EXISTS')).toBe(400);
      expect(factory.getHttpStatus('RATE_LIMIT_EXCEEDED')).toBe(429);
      expect(factory.getHttpStatus('INTERNAL_ERROR')).toBe(500);
      expect(factory.getHttpStatus('EMAIL_VERIFICATION_EXPIRED')).toBe(410);
    });

    it('should report production mode correctly', () => {
      expect(factory.isProductionMode()).toBe(true);
    });
  });

  describe('Development Mode', () => {
    let factory: ErrorResponseFactory;

    beforeEach(() => {
      factory = new ErrorResponseFactory({ isProduction: false });
    });

    it('should create detailed error responses', () => {
      const response = factory.createErrorResponse(
        'INVALID_CREDENTIALS',
        'Password hash verification failed for user@example.com',
      );

      expect(response.success).toBe(false);
      expect(response.error).toBe('INVALID_CREDENTIALS');
      expect((response as DevelopmentErrorResponse).details).toBe(
        'Password hash verification failed for user@example.com',
      );
      expect((response as DevelopmentErrorResponse).timestamp).toBeDefined();
    });

    it('should include stack traces when error is provided', () => {
      const error = new Error('Database connection failed');
      const response = factory.createErrorResponse('INTERNAL_ERROR', 'Connection error', error);

      expect((response as DevelopmentErrorResponse).stack).toBeDefined();
      expect((response as DevelopmentErrorResponse).stack).toContain(
        'Error: Database connection failed',
      );
    });

    it('should use default details when not provided', () => {
      const response = factory.createErrorResponse('SESSION_EXPIRED');

      expect((response as DevelopmentErrorResponse).details).toBe('Error: SESSION_EXPIRED');
    });

    it('should report development mode correctly', () => {
      expect(factory.isProductionMode()).toBe(false);
    });
  });

  describe('Environment Detection', () => {
    const env = process.env as Record<string, string | undefined>;
    const originalEnv = env.NODE_ENV;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete env.NODE_ENV;
      } else {
        env.NODE_ENV = originalEnv;
      }
    });

    it('should default to production mode when NODE_ENV is production', () => {
      env.NODE_ENV = 'production';
      const factory = new ErrorResponseFactory();
      expect(factory.isProductionMode()).toBe(true);
    });

    it('should default to development mode when NODE_ENV is not production', () => {
      env.NODE_ENV = 'development';
      const factory = new ErrorResponseFactory();
      expect(factory.isProductionMode()).toBe(false);
    });

    it('should default to development mode when NODE_ENV is undefined', () => {
      delete env.NODE_ENV;
      const factory = new ErrorResponseFactory();
      expect(factory.isProductionMode()).toBe(false);
    });
  });

  describe('containsSensitiveInfo', () => {
    it('should detect sensitive info in development responses', () => {
      const devResponse: DevelopmentErrorResponse = {
        success: false,
        error: 'INTERNAL_ERROR',
        details: 'Database error occurred',
        timestamp: new Date().toISOString(),
        stack: 'Error: test\n    at Object.<anonymous> (/path/to/file.ts:10:5)',
      };

      expect(ErrorResponseFactory.containsSensitiveInfo(devResponse)).toBe(true);
    });

    it('should not detect sensitive info in production responses', () => {
      const prodResponse: ProductionErrorResponse = {
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Authentication failed. Please check your credentials.',
        code: 'AUTH_001',
      };

      expect(ErrorResponseFactory.containsSensitiveInfo(prodResponse)).toBe(false);
    });

    it('should detect responses with details field as sensitive', () => {
      const response = {
        success: false as const,
        error: 'INTERNAL_ERROR' as const,
        details: 'Some details',
        timestamp: new Date().toISOString(),
      };

      expect(ErrorResponseFactory.containsSensitiveInfo(response)).toBe(true);
    });
  });
});
