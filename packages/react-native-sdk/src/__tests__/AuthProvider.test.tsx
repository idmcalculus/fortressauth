import { act, renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth, useUser } from '../AuthProvider.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock storage module
const storageData = new Map<string, string>();
const mockStorage = {
  getItem: vi.fn(async (key: string) => storageData.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    storageData.set(key, value);
  }),
  removeItem: vi.fn(async (key: string) => {
    storageData.delete(key);
  }),
};

vi.mock('../storage.js', () => ({
  getDefaultStorage: () => mockStorage,
  createAsyncStorage: () => mockStorage,
}));

function createWrapper(baseUrl?: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <AuthProvider {...(baseUrl ? { baseUrl } : {})}>{children}</AuthProvider>;
  };
}

describe('AuthProvider (React Native)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    storageData.clear();

    // Default mock implementation
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/me')) {
        return {
          json: () => Promise.resolve({ success: false, error: 'No session' }),
        };
      }
      return {
        json: () => Promise.resolve({ success: true, data: {} }),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should check storage for token on mount', async () => {
      storageData.set('fortress_auth_token', 'stored-token');
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/me')) {
          return {
            json: () =>
              Promise.resolve({
                success: true,
                data: { user: { id: '1', email: 'test@example.com' } },
              }),
          };
        }
        return { json: () => Promise.resolve({ success: false }) };
      });

      renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockStorage.getItem).toHaveBeenCalledWith('fortress_auth_token');
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/auth/me',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer stored-token',
            }),
          }),
        );
      });
    });

    it('should set loading to false if no token in storage', async () => {
      storageData.clear();

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
    });
  });

  describe('signUp', () => {
    it('should call /auth/signup and store token on success', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/signup')) {
          return {
            json: () =>
              Promise.resolve({
                success: true,
                data: { user: { id: '2', email: 'new@example.com' }, token: 'new-token' },
              }),
          };
        }
        if (url.endsWith('/auth/me')) {
          return {
            json: () =>
              Promise.resolve({
                success: true,
                data: { user: { id: '2', email: 'new@example.com' } },
              }),
          };
        }
        return { json: () => Promise.resolve({ success: false }) };
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      // Wait for initial storage check
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signUp('new@example.com', 'password123');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/signup',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockStorage.setItem).toHaveBeenCalledWith('fortress_auth_token', 'new-token');

      await waitFor(() => {
        expect(result.current.user?.email).toBe('new@example.com');
      });
    });

    it('should not store token when signup response has no token', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/signup')) {
          return {
            json: () =>
              Promise.resolve({
                success: true,
                data: { user: { id: '2', email: 'new@example.com' } },
              }),
          };
        }
        return { json: () => Promise.resolve({ success: false }) };
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signUp('new@example.com', 'password123');
      });

      expect(mockStorage.setItem).not.toHaveBeenCalled();
      expect(result.current.user?.email).toBe('new@example.com');
    });

    it('should set error when signup fails', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/signup')) {
          return {
            json: () => Promise.resolve({ success: false, error: 'Signup failed' }),
          };
        }
        return { json: () => Promise.resolve({ success: false }) };
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signUp('new@example.com', 'password123');
      });

      expect(result.current.error).toBe('Signup failed');
    });
  });

  describe('signIn', () => {
    it('should call /auth/login and store token on success', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/login')) {
          return {
            json: () =>
              Promise.resolve({
                success: true,
                data: { user: { id: '1', email: 'test@example.com' }, token: 'login-token' },
              }),
          };
        }
        if (url.endsWith('/auth/me')) {
          return {
            json: () =>
              Promise.resolve({
                success: true,
                data: { user: { id: '1', email: 'test@example.com' } },
              }),
          };
        }
        return { json: () => Promise.resolve({ success: false }) };
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/login',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockStorage.setItem).toHaveBeenCalledWith('fortress_auth_token', 'login-token');

      await waitFor(() => {
        expect(result.current.user?.email).toBe('test@example.com');
      });
    });

    it('should set error when signin fails', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/login')) {
          return {
            json: () => Promise.resolve({ success: false, error: 'Invalid credentials' }),
          };
        }
        return { json: () => Promise.resolve({ success: false }) };
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      expect(result.current.error).toBe('Invalid credentials');
    });

    it('should surface network errors during signin', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      expect(result.current.error).toBe('Network down');
    });
  });

  describe('signOut', () => {
    it('should call /auth/logout and clear storage', async () => {
      storageData.set('fortress_auth_token', 'existing-token');

      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/me')) {
          if (storageData.get('fortress_auth_token')) {
            return {
              json: () =>
                Promise.resolve({
                  success: true,
                  data: { user: { id: '1', email: 'test@example.com' } },
                }),
            };
          }
          return {
            json: () => Promise.resolve({ success: false, error: 'No session' }),
          };
        }
        if (url.endsWith('/auth/logout')) {
          return {
            json: () => Promise.resolve({ success: true }),
          };
        }
        return { json: () => Promise.resolve({ success: false }) };
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.user).not.toBeNull());

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/logout',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(mockStorage.removeItem).toHaveBeenCalledWith('fortress_auth_token');

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });
    });

    it('should keep user when logout fails', async () => {
      storageData.set('fortress_auth_token', 'existing-token');

      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/me')) {
          return {
            json: () =>
              Promise.resolve({
                success: true,
                data: { user: { id: '1', email: 'test@example.com' } },
              }),
          };
        }
        if (url.endsWith('/auth/logout')) {
          return { json: () => Promise.resolve({ success: false }) };
        }
        return { json: () => Promise.resolve({ success: false }) };
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.user).not.toBeNull());

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockStorage.removeItem).not.toHaveBeenCalled();
      expect(result.current.user?.email).toBe('test@example.com');
    });
  });

  describe('auxiliary endpoints', () => {
    it('should call verifyEmail, requestPasswordReset, and resetPassword', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/verify-email')) {
          return { json: () => Promise.resolve({ success: true, data: { verified: true } }) };
        }
        if (url.endsWith('/auth/request-password-reset')) {
          return { json: () => Promise.resolve({ success: true, data: { requested: true } }) };
        }
        if (url.endsWith('/auth/reset-password')) {
          return { json: () => Promise.resolve({ success: true, data: { reset: true } }) };
        }
        return { json: () => Promise.resolve({ success: false }) };
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper('https://api.example.com'),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.verifyEmail('verify-token');
        await result.current.requestPasswordReset('test@example.com');
        await result.current.resetPassword('reset-token', 'new-password');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/auth/verify-email',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'verify-token' }),
        }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/auth/request-password-reset',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com' }),
        }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/auth/reset-password',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'reset-token', newPassword: 'new-password' }),
        }),
      );
    });
  });
});

describe('useAuth (React Native)', () => {
  it('should throw when used outside provider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within an AuthProvider',
    );
  });
});

describe('useUser (React Native)', () => {
  it('should return user state from context', async () => {
    storageData.set('fortress_auth_token', 'token');
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/me')) {
        return {
          json: () =>
            Promise.resolve({
              success: true,
              data: { user: { id: '1', email: 'test@example.com' } },
            }),
        };
      }
      return { json: () => Promise.resolve({ success: false }) };
    });

    const { result } = renderHook(() => useUser(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.email).toBe('test@example.com');
  });
});
