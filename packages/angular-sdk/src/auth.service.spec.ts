import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create service with default baseUrl', () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
      expect(service).toBeDefined();
    });

    it('should create service with custom baseUrl from config', () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService({ baseUrl: 'https://custom.api.com' });
      expect(service).toBeDefined();
    });

    it('should use window.__FORTRESS_API_URL__ if present', () => {
      vi.stubGlobal('window', { __FORTRESS_API_URL__: 'https://env.api.com' });
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });

      service = new AuthService();
      // Wait for async initialization
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(mockFetch).toHaveBeenCalledWith('https://env.api.com/auth/me', expect.any(Object));
          vi.unstubAllGlobals();
          resolve();
        }, 10);
      });
    });

    it('should call refreshUser on initialization', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              user: {
                id: '1',
                email: 'test@example.com',
                emailVerified: true,
                createdAt: '2024-01-01',
              },
            },
          }),
      });
      service = new AuthService();
      // Wait for async initialization
      await new Promise((r) => setTimeout(r, 10));
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/me',
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });

  describe('signUp', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should sign up successfully', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: '2024-01-01',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });

      const result = await service.signUp('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.data?.user).toEqual(mockUser);
      expect(service.currentUser).toEqual(mockUser);
    });

    it('should handle signup failure', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Email already exists' }),
      });

      const result = await service.signUp('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already exists');
      expect(service.currentError).toBe('Email already exists');
    });

    it('should handle signup failure with default error message', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false }),
      });

      const result = await service.signUp('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(service.currentError).toBe('UNKNOWN_ERROR');
    });
  });

  describe('signIn', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should sign in successfully', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: true,
        createdAt: '2024-01-01',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(service.currentUser).toEqual(mockUser);
    });

    it('should handle signin failure', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Invalid credentials' }),
      });

      const result = await service.signIn('test@example.com', 'wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should handle signin failure with default error message', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false }),
      });

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(service.currentError).toBe('UNKNOWN_ERROR');
    });
  });

  describe('signOut', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should sign out successfully', async () => {
      // First sign in
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: true,
        createdAt: '2024-01-01',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });
      await service.signIn('test@example.com', 'password123');

      // Then sign out
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });
      const result = await service.signOut();

      expect(result.success).toBe(true);
      expect(service.currentUser).toBeNull();
    });
  });

  describe('verifyEmail', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should verify email successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { verified: true } }),
      });

      const result = await service.verifyEmail('valid-token');

      expect(result.success).toBe(true);
      expect(result.data?.verified).toBe(true);
    });
  });

  describe('requestPasswordReset', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should request password reset successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { requested: true } }),
      });

      const result = await service.requestPasswordReset('test@example.com');

      expect(result.success).toBe(true);
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should reset password successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { reset: true } }),
      });

      const result = await service.resetPassword('valid-token', 'newPassword123');

      expect(result.success).toBe(true);
    });
  });

  describe('observables', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should emit user changes via user$', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: true,
        createdAt: '2024-01-01',
      };
      const users: (typeof mockUser | null)[] = [];

      service.user$.subscribe((user) => users.push(user));

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });
      await service.signIn('test@example.com', 'password123');

      expect(users).toContain(mockUser);
    });

    it('should expose loading$ observable', () => {
      let loading: boolean | undefined;
      service.loading$.subscribe((l) => (loading = l));
      expect(typeof loading).toBe('boolean');
    });

    it('should expose error$ observable', () => {
      let error: string | null | undefined;
      service.error$.subscribe((e) => (error = e));
      expect(error === null || typeof error === 'string').toBe(true);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle non-Error exceptions in apiRequest', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
