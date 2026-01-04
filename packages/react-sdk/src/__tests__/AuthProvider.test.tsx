import { act, renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth, useUser } from '../AuthProvider.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const jsonResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  headers: {
    get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
  },
  json: () => Promise.resolve(payload),
});

const textResponse = (ok: boolean, status: number) => ({
  ok,
  status,
  headers: {
    get: () => 'text/plain',
  },
  json: () => Promise.resolve({}),
});

function createWrapper(baseUrl?: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <AuthProvider {...(baseUrl ? { baseUrl } : {})}>{children}</AuthProvider>;
  };
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should call /auth/me on mount', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { user: { id: '1', email: 'test@example.com' } },
        }),
      );

      renderHook(() => useAuth(), { wrapper: createWrapper('http://localhost:3000') });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/auth/me',
          expect.objectContaining({ credentials: 'include' }),
        );
      });
    });

    it('should set user from /auth/me response', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { user: { id: '1', email: 'test@example.com' } },
        }),
      );

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toEqual({ id: '1', email: 'test@example.com' });
    });

    it('should set error when /auth/me fails', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: false, error: 'UNAUTHORIZED' }));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.error).toBe('UNAUTHORIZED');
    });
  });

  describe('signUp', () => {
    it('should call /auth/signup and set user on success', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: false })).mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { user: { id: '2', email: 'new@example.com' } },
        }),
      ); // Initial /auth/me

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signUp('new@example.com', 'password123');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/signup',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.current.user?.email).toBe('new@example.com');
    });

    it('should set error on signUp failure', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: false, error: 'EMAIL_EXISTS' }));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signUp('existing@example.com', 'password123');
      });

      expect(result.current.error).toBe('EMAIL_EXISTS');
    });

    it('should set UNKNOWN_ERROR when no error message in response', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: false })); // No error field

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signUp('test@example.com', 'password123');
      });

      expect(result.current.error).toBe('UNKNOWN_ERROR');
    });
  });

  describe('signIn', () => {
    it('should call /auth/login and set user on success', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: false })).mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { user: { id: '1', email: 'test@example.com' } },
        }),
      );

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/login',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.current.user?.email).toBe('test@example.com');
    });

    it('should set error on signIn failure', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: false, error: 'INVALID_CREDENTIALS' }));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signIn('test@example.com', 'wrongpassword');
      });

      expect(result.current.error).toBe('INVALID_CREDENTIALS');
    });

    it('should set UNKNOWN_ERROR when signIn fails without error message', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: false })); // No error field

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signIn('test@example.com', 'wrongpassword');
      });

      expect(result.current.error).toBe('UNKNOWN_ERROR');
    });

    it('should handle non-JSON success responses', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(textResponse(true, 204));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      expect(result.current.error).toBe('UNKNOWN_ERROR');
    });

    it('should surface HTTP error codes for non-JSON failures', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(textResponse(false, 500));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      expect(result.current.error).toBe('HTTP_500');
    });

    it('should surface fetch errors', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: false })).mockRejectedValueOnce(
        new Error('Network down'),
      );

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      expect(result.current.error).toBe('Network down');
    });

    it('should fall back to FETCH_ERROR for non-Error failures', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockRejectedValueOnce('boom');

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      expect(result.current.error).toBe('FETCH_ERROR');
    });
  });

  describe('signOut', () => {
    it('should call /auth/logout and clear user on success', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            success: true,
            data: { user: { id: '1', email: 'test@example.com' } },
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ success: true }));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.user).not.toBeNull());

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.current.user).toBeNull();
    });
  });

  describe('verifyEmail', () => {
    it('should call /auth/verify-email with token', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { verified: true } }));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const response = await result.current.verifyEmail('token123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/verify-email',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'token123' }) }),
      );
      expect(response.success).toBe(true);
    });
  });

  describe('requestPasswordReset', () => {
    it('should call /auth/request-password-reset with email', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { requested: true } }));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const response = await result.current.requestPasswordReset('test@example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/request-password-reset',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com' }),
        }),
      );
      expect(response.success).toBe(true);
    });
  });

  describe('resetPassword', () => {
    it('should call /auth/reset-password with token and new password', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { reset: true } }));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const response = await result.current.resetPassword('token123', 'newpassword');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/reset-password',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'token123', newPassword: 'newpassword' }),
        }),
      );
      expect(response.success).toBe(true);
    });
  });
});

describe('useAuth', () => {
  it('should throw error when used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');
  });
});

describe('useUser', () => {
  it('should return user, loading, and error from context', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { user: { id: '1', email: 'test@example.com' } } }),
    );

    const { result } = renderHook(() => useUser(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toEqual({ id: '1', email: 'test@example.com' });
    expect(result.current.error).toBeNull();
  });
});
