import { derived, writable } from 'svelte/store';
import type { ApiResponse, AuthConfig, AuthState, OAuthProvider, User } from './types.js';

const CSRF_COOKIE_NAME = 'fortress_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const csrfTokenCache = new Map<string, string>();
const csrfPromiseCache = new Map<string, Promise<string>>();

function resolveBaseUrl(explicit?: string): string {
  if (typeof window !== 'undefined') {
    // biome-ignore lint/suspicious/noExplicitAny: import.meta is not fully typed in all environments
    const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    if (envUrl) return envUrl;
  }
  return explicit ?? 'http://localhost:3000';
}

function getCookieValue(name: string): string | null {
  const doc = (globalThis as { document?: { cookie?: string } }).document;
  const cookie = doc?.cookie;
  if (!cookie) return null;
  const entry = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

async function fetchCsrfToken(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/csrf`, { credentials: 'include' });
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    const data = (await res.json()) as ApiResponse<{ csrfToken: string }>;
    if (data.success && data.data?.csrfToken) {
      return data.data.csrfToken;
    }
  }
  throw new Error('CSRF_TOKEN_UNAVAILABLE');
}

async function getCsrfToken(baseUrl: string): Promise<string> {
  const cookieToken = getCookieValue(CSRF_COOKIE_NAME);
  if (cookieToken) {
    csrfTokenCache.set(baseUrl, cookieToken);
    return cookieToken;
  }

  const cached = csrfTokenCache.get(baseUrl);
  if (cached) return cached;

  const inflight = csrfPromiseCache.get(baseUrl);
  if (inflight) return inflight;

  const promise = fetchCsrfToken(baseUrl)
    .then((token) => {
      csrfTokenCache.set(baseUrl, token);
      return token;
    })
    .finally(() => {
      csrfPromiseCache.delete(baseUrl);
    });
  csrfPromiseCache.set(baseUrl, promise);
  return promise;
}

function clearCsrfToken(baseUrl: string): void {
  csrfTokenCache.delete(baseUrl);
}

async function apiRequest<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  retry = false,
): Promise<ApiResponse<T>> {
  try {
    const method = init?.method?.toUpperCase() ?? 'GET';
    const requiresCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    let csrfToken: string | undefined;
    if (requiresCsrf) {
      try {
        csrfToken = await getCsrfToken(baseUrl);
      } catch {
        csrfToken = undefined;
      }
    }

    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const data = (await res.json()) as ApiResponse<T>;
    if (!retry && requiresCsrf && !data.success && data.error === 'CSRF_TOKEN_INVALID') {
      clearCsrfToken(baseUrl);
      return apiRequest(baseUrl, path, init, true);
    }
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Creates a FortressAuth store for Svelte applications.
 * @param config - Optional configuration object
 * @returns Auth store with user state and auth methods
 */
export function createAuthStore(config?: AuthConfig) {
  const baseUrl = resolveBaseUrl(config?.baseUrl);

  // Create the main state store
  const state = writable<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  // Derived stores for convenience
  const user = derived(state, ($state) => $state.user);
  const loading = derived(state, ($state) => $state.loading);
  const error = derived(state, ($state) => $state.error);

  function updateState(partial: Partial<AuthState>) {
    state.update((s) => ({ ...s, ...partial }));
  }

  async function refreshUser(): Promise<void> {
    updateState({ loading: true });
    const response = await apiRequest<{ user: User }>(baseUrl, '/auth/me');
    if (response.success && response.data) {
      updateState({ user: response.data.user, error: null, loading: false });
    } else {
      updateState({ user: null, error: response.error ?? null, loading: false });
    }
  }

  async function signUp(email: string, password: string): Promise<ApiResponse<{ user: User }>> {
    const response = await apiRequest<{ user: User }>(baseUrl, '/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (response.success && response.data) {
      updateState({ user: response.data.user, error: null });
    } else {
      updateState({ error: response.error ?? 'UNKNOWN_ERROR' });
    }
    return response;
  }

  async function signIn(email: string, password: string): Promise<ApiResponse<{ user: User }>> {
    const response = await apiRequest<{ user: User }>(baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (response.success && response.data) {
      updateState({ user: response.data.user, error: null });
    } else {
      updateState({ error: response.error ?? 'UNKNOWN_ERROR' });
    }
    return response;
  }

  function signInWithOAuth(provider: OAuthProvider): void {
    if (typeof window !== 'undefined') {
      window.location.href = `${baseUrl}/auth/oauth/${provider}`;
    }
  }

  async function signOut(): Promise<ApiResponse<unknown>> {
    const response = await apiRequest(baseUrl, '/auth/logout', { method: 'POST' });
    if (response.success) {
      updateState({ user: null });
    }
    return response;
  }

  async function verifyEmail(token: string): Promise<ApiResponse<{ verified: boolean }>> {
    return apiRequest<{ verified: boolean }>(baseUrl, '/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async function requestPasswordReset(email: string): Promise<ApiResponse<{ requested: boolean }>> {
    return apiRequest<{ requested: boolean }>(baseUrl, '/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async function resetPassword(
    token: string,
    newPassword: string,
  ): Promise<ApiResponse<{ reset: boolean }>> {
    return apiRequest<{ reset: boolean }>(baseUrl, '/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  }

  // Initialize by fetching user (only in browser)
  if (typeof window !== 'undefined') {
    refreshUser();
  }

  return {
    // Stores
    subscribe: state.subscribe,
    user,
    loading,
    error,
    // Methods
    signUp,
    signIn,
    signInWithOAuth,
    signOut,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    refreshUser,
  };
}

// Singleton store for simple use cases
let defaultStore: ReturnType<typeof createAuthStore> | null = null;

/**
 * Gets the default auth store (creates one if it doesn't exist).
 * For most applications, use createAuthStore() directly for better control.
 */
export function getAuthStore(config?: AuthConfig): ReturnType<typeof createAuthStore> {
  if (!defaultStore) {
    defaultStore = createAuthStore(config);
  }
  return defaultStore;
}
