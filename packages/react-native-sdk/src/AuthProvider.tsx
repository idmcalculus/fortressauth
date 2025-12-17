import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getDefaultStorage } from './storage.js';
import type {
  ApiResponse,
  AuthContextValue,
  AuthProviderProps,
  AuthStorage,
  User,
} from './types.js';

const TOKEN_STORAGE_KEY = 'fortress_auth_token';

function resolveBaseUrl(explicit?: string): string {
  return explicit ?? 'http://localhost:3000';
}

async function apiRequest<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  token?: string | null,
): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) ?? {}),
    };

    // Add auth token if available (for React Native, we use token-based auth instead of cookies)
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
    const data = (await res.json()) as ApiResponse<T>;
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface RNAuthProviderProps extends AuthProviderProps {
  storage?: AuthStorage;
}

export const AuthProvider: React.FC<RNAuthProviderProps> = ({
  children,
  baseUrl: explicitBaseUrl,
  storage: customStorage,
}) => {
  const baseUrl = useMemo(() => resolveBaseUrl(explicitBaseUrl), [explicitBaseUrl]);
  const storage = useMemo(() => customStorage ?? getDefaultStorage(), [customStorage]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Load token on mount
  useEffect(() => {
    storage.getItem(TOKEN_STORAGE_KEY).then((storedToken) => {
      if (storedToken) {
        setToken(storedToken);
      }
    });
  }, [storage]);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    const currentToken = await storage.getItem(TOKEN_STORAGE_KEY);
    const response = await apiRequest<{ user: User }>(baseUrl, '/auth/me', undefined, currentToken);
    if (response.success && response.data) {
      setUser(response.data.user);
      setError(null);
    } else {
      setUser(null);
      setError(response.error ?? null);
    }
    setLoading(false);
  }, [baseUrl, storage]);

  useEffect(() => {
    if (token !== null) {
      void refreshUser();
    } else {
      // Check for stored token
      storage.getItem(TOKEN_STORAGE_KEY).then((storedToken) => {
        if (storedToken) {
          setToken(storedToken);
        } else {
          setLoading(false);
        }
      });
    }
  }, [token, refreshUser, storage]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      const response = await apiRequest<{ user: User; token?: string }>(baseUrl, '/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (response.success && response.data) {
        setUser(response.data.user);
        setError(null);
        // Store token if provided
        if (response.data.token) {
          await storage.setItem(TOKEN_STORAGE_KEY, response.data.token);
          setToken(response.data.token);
        }
      } else {
        setError(response.error ?? 'UNKNOWN_ERROR');
      }
      return response as ApiResponse<{ user: User }>;
    },
    [baseUrl, storage],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await apiRequest<{ user: User; token?: string }>(baseUrl, '/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (response.success && response.data) {
        setUser(response.data.user);
        setError(null);
        // Store token if provided
        if (response.data.token) {
          await storage.setItem(TOKEN_STORAGE_KEY, response.data.token);
          setToken(response.data.token);
        }
      } else {
        setError(response.error ?? 'UNKNOWN_ERROR');
      }
      return response as ApiResponse<{ user: User }>;
    },
    [baseUrl, storage],
  );

  const signOut = useCallback(async () => {
    const currentToken = await storage.getItem(TOKEN_STORAGE_KEY);
    const response = await apiRequest(baseUrl, '/auth/logout', { method: 'POST' }, currentToken);
    if (response.success) {
      setUser(null);
      await storage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
    }
    return response;
  }, [baseUrl, storage]);

  const verifyEmail = useCallback(
    async (emailToken: string): Promise<ApiResponse<{ verified: boolean }>> =>
      apiRequest<{ verified: boolean }>(baseUrl, '/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: emailToken }),
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
    async (resetToken: string, newPassword: string): Promise<ApiResponse<{ reset: boolean }>> =>
      apiRequest<{ reset: boolean }>(baseUrl, '/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword }),
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
