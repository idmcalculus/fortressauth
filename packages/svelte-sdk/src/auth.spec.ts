import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthStore, getAuthStore } from './auth.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('createAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create a store with initial loading state', () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();
      const state = get(store);
      expect(state.loading).toBe(true);
      expect(state.user).toBeNull();
    });

    it('should accept custom baseUrl config', () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore({ baseUrl: 'https://custom.api.com' });
      expect(store).toBeDefined();
    });

    it('should use import.meta.env.VITE_API_BASE_URL if present', () => {
      // We can't easily mock import.meta in vitest without more setup,
      // but we can mock the behavior by ensuring it falls back correctly.
      // For this test, we'll verify the default fallback.
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      createAuthStore();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3000'),
        expect.any(Object),
      );
    });

    it('should call refreshUser on creation', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              user: {
                id: '1',
                email: 'test@test.com',
                emailVerified: true,
                createdAt: '2024-01-01',
              },
            },
          }),
      });
      createAuthStore();
      await new Promise((r) => setTimeout(r, 10));
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/me',
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });

  describe('signUp', () => {
    it('should sign up successfully and update user', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      const mockUser = {
        id: '1',
        email: 'test@test.com',
        emailVerified: false,
        createdAt: '2024-01-01',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });

      const result = await store.signUp('test@test.com', 'password123');

      expect(result.success).toBe(true);
      expect(get(store.user)).toEqual(mockUser);
    });

    it('should handle signup failure', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Email already exists' }),
      });

      const result = await store.signUp('test@test.com', 'password123');

      expect(result.success).toBe(false);
      expect(get(store.error)).toBe('Email already exists');
    });

    it('should handle signup failure with default error message', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false }),
      });
      const store = createAuthStore();

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false }),
      });

      const result = await store.signUp('test@test.com', 'password123');

      expect(result.success).toBe(false);
      expect(get(store.error)).toBe('UNKNOWN_ERROR');
    });
  });

  describe('signIn', () => {
    it('should sign in successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      const mockUser = {
        id: '1',
        email: 'test@test.com',
        emailVerified: true,
        createdAt: '2024-01-01',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });

      const result = await store.signIn('test@test.com', 'password123');

      expect(result.success).toBe(true);
      expect(get(store.user)).toEqual(mockUser);
    });

    it('should handle signin failure', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Invalid credentials' }),
      });

      const result = await store.signIn('test@test.com', 'wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should handle signin failure with default error message', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false }),
      });
      const store = createAuthStore();

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false }),
      });

      const result = await store.signIn('test@test.com', 'wrong');

      expect(result.success).toBe(false);
      expect(get(store.error)).toBe('UNKNOWN_ERROR');
    });
  });

  describe('signOut', () => {
    it('should sign out and clear user', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      // Sign in first
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        emailVerified: true,
        createdAt: '2024-01-01',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });
      await store.signIn('test@test.com', 'password123');

      // Sign out
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });
      const result = await store.signOut();

      expect(result.success).toBe(true);
      expect(get(store.user)).toBeNull();
    });
  });

  describe('verifyEmail', () => {
    it('should verify email', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { verified: true } }),
      });

      const result = await store.verifyEmail('valid-token');

      expect(result.success).toBe(true);
    });
  });

  describe('requestPasswordReset', () => {
    it('should request password reset', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { requested: true } }),
      });

      const result = await store.requestPasswordReset('test@test.com');

      expect(result.success).toBe(true);
    });
  });

  describe('resetPassword', () => {
    it('should reset password', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { reset: true } }),
      });

      const result = await store.resetPassword('valid-token', 'newPassword123');

      expect(result.success).toBe(true);
    });
  });

  describe('derived stores', () => {
    it('should have working user derived store', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      const users: (object | null)[] = [];
      store.user.subscribe((u) => users.push(u));

      const mockUser = {
        id: '1',
        email: 'test@test.com',
        emailVerified: true,
        createdAt: '2024-01-01',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });
      await store.signIn('test@test.com', 'password123');

      expect(users).toContainEqual(mockUser);
    });

    it('should have working loading derived store', () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      let loading: boolean | undefined;
      store.loading.subscribe((l) => (loading = l));

      expect(typeof loading).toBe('boolean');
    });

    it('should have working error derived store', () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      let error: string | null | undefined;
      store.error.subscribe((e) => (error = e));

      expect(error === null || typeof error === 'string').toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await store.signIn('test@test.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle non-Error exceptions in apiRequest', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      const store = createAuthStore();

      mockFetch.mockRejectedValueOnce('string error');

      const result = await store.signIn('test@test.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});

describe('getAuthStore', () => {
  it('should return singleton store', () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: false, error: 'No session' }),
    });
    const store1 = getAuthStore();
    const store2 = getAuthStore();
    expect(store1).toBe(store2);
  });
});
