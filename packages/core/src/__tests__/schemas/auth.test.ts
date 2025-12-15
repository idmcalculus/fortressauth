import { describe, expect, it } from 'vitest';
import {
  AuthResponseSchema,
  ErrorResponseSchema,
  LoginRequestSchema,
  SignupRequestSchema,
  UserResponseSchema,
} from '../../schemas/auth.js';

describe('Auth schemas', () => {
  describe('SignupRequestSchema', () => {
    it('should validate valid signup request', () => {
      const result = SignupRequestSchema.safeParse({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
        expect(result.data.password).toBe('SecurePass123!');
      }
    });

    it('should normalize email to lowercase', () => {
      const result = SignupRequestSchema.safeParse({
        email: 'TEST@EXAMPLE.COM',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('should reject invalid email', () => {
      const result = SignupRequestSchema.safeParse({
        email: 'not-an-email',
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(false);
    });

    it('should reject password shorter than 8 characters', () => {
      const result = SignupRequestSchema.safeParse({
        email: 'test@example.com',
        password: 'short',
      });

      expect(result.success).toBe(false);
    });

    it('should reject password longer than 128 characters', () => {
      const result = SignupRequestSchema.safeParse({
        email: 'test@example.com',
        password: 'a'.repeat(129),
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing email', () => {
      const result = SignupRequestSchema.safeParse({
        password: 'SecurePass123!',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing password', () => {
      const result = SignupRequestSchema.safeParse({
        email: 'test@example.com',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('LoginRequestSchema', () => {
    it('should validate valid login request', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'test@example.com',
        password: 'anypassword',
      });

      expect(result.success).toBe(true);
    });

    it('should normalize email to lowercase', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'TEST@EXAMPLE.COM',
        password: 'password',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('should reject invalid email', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'invalid',
        password: 'password',
      });

      expect(result.success).toBe(false);
    });

    it('should accept any password length for login', () => {
      // Login doesn't validate password strength, just presence
      const result = LoginRequestSchema.safeParse({
        email: 'test@example.com',
        password: 'x',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('UserResponseSchema', () => {
    it('should validate valid user response', () => {
      const result = UserResponseSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: '2024-01-15T10:00:00.000Z',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = UserResponseSchema.safeParse({
        id: 'not-a-uuid',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: '2024-01-15T10:00:00.000Z',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid datetime', () => {
      const result = UserResponseSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: 'not-a-date',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('AuthResponseSchema', () => {
    it('should validate valid auth response', () => {
      const result = AuthResponseSchema.safeParse({
        success: true,
        data: {
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'test@example.com',
            emailVerified: false,
            createdAt: '2024-01-15T10:00:00.000Z',
          },
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject success: false', () => {
      const result = AuthResponseSchema.safeParse({
        success: false,
        data: {
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'test@example.com',
            emailVerified: false,
            createdAt: '2024-01-15T10:00:00.000Z',
          },
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('ErrorResponseSchema', () => {
    it('should validate valid error response', () => {
      const result = ErrorResponseSchema.safeParse({
        success: false,
        error: 'INVALID_CREDENTIALS',
      });

      expect(result.success).toBe(true);
    });

    it('should reject success: true', () => {
      const result = ErrorResponseSchema.safeParse({
        success: true,
        error: 'INVALID_CREDENTIALS',
      });

      expect(result.success).toBe(false);
    });
  });
});
