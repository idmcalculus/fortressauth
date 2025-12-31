import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ApiResponse, AuthContextValue, AuthProviderProps, User } from './types.js';

function resolveBaseUrl(explicit?: string): string {
  const envBaseUrl =
    typeof import.meta !== 'undefined' && typeof import.meta === 'object'
      ? // biome-ignore lint/suspicious/noExplicitAny: import.meta is not fully typed
      ((import.meta as any).env?.VITE_API_BASE_URL ??
        // biome-ignore lint/suspicious/noExplicitAny: import.meta is not fully typed
        (import.meta as any).env?.NEXT_PUBLIC_API_BASE_URL)
      : undefined;
  return explicit ?? envBaseUrl ?? 'http://localhost:3000';
}

async function apiRequest<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const data = (await res.json()) as ApiResponse<T>;
      return data;
    }

    if (res.ok) {
      return { success: true } as ApiResponse<T>;
    }

    return {
      success: false,
      error: `HTTP_${res.status}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'FETCH_ERROR',
    };
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  baseUrl: explicitBaseUrl,
}) => {
  const baseUrl = useMemo(() => resolveBaseUrl(explicitBaseUrl), [explicitBaseUrl]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest<{ user: User }>(baseUrl, '/auth/me');
      if (response.success && response.data) {
        setUser(response.data.user);
        setError(null);
      } else {
        setUser(null);
        setError(response.error ?? null);
      }
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : 'UNKNOWN_ERROR');
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      const response = await apiRequest<{ user: User }>(baseUrl, '/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (response.success && response.data) {
        setUser(response.data.user);
        setError(null);
      } else {
        setError(response.error ?? 'UNKNOWN_ERROR');
      }
      return response;
    },
    [baseUrl],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await apiRequest<{ user: User }>(baseUrl, '/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (response.success && response.data) {
        setUser(response.data.user);
        setError(null);
      } else {
        setError(response.error ?? 'UNKNOWN_ERROR');
      }
      return response;
    },
    [baseUrl],
  );

  const signOut = useCallback(async () => {
    const response = await apiRequest(baseUrl, '/auth/logout', { method: 'POST' });
    if (response.success) {
      setUser(null);
    }
    return response;
  }, [baseUrl]);

  const verifyEmail = useCallback(
    async (token: string): Promise<ApiResponse<{ verified: boolean }>> =>
      apiRequest<{ verified: boolean }>(baseUrl, '/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    [baseUrl],
  );

  const requestPasswordReset = useCallback(
    async (email: string): Promise<ApiResponse<{ requested: boolean }>> =>
      apiRequest<{ requested: boolean }>(baseUrl, '/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    [baseUrl],
  );

  const resetPassword = useCallback(
    async (token: string, newPassword: string): Promise<ApiResponse<{ reset: boolean }>> =>
      apiRequest<{ reset: boolean }>(baseUrl, '/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      }),
    [baseUrl],
  );

  const value: AuthContextValue = {
    user,
    loading,
    error,
    signUp,
    signIn,
    signOut,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export function useUser(): { user: User | null; loading: boolean; error: string | null } {
  const ctx = useAuth();
  return { user: ctx.user, loading: ctx.loading, error: ctx.error };
}
