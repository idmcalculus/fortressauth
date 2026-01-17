import { computed, defineComponent, h, inject, onMounted, provide, reactive, toRef } from 'vue';
import type {
  ApiResponse,
  AuthContextValue,
  AuthProviderProps,
  OAuthProvider,
  User,
} from './types.js';

const CSRF_COOKIE_NAME = 'fortress_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const csrfTokenCache = new Map<string, string>();
const csrfPromiseCache = new Map<string, Promise<string>>();

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

    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const data = (await res.json()) as ApiResponse<T>;
      if (!retry && requiresCsrf && !data.success && data.error === 'CSRF_TOKEN_INVALID') {
        clearCsrfToken(baseUrl);
        return apiRequest(baseUrl, path, init, true);
      }
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

const AuthSymbol = Symbol('FortressAuthContext');

export const AuthProvider = defineComponent<AuthProviderProps>({
  name: 'AuthProvider',
  props: {
    baseUrl: {
      type: String,
      required: false,
    },
  },
  setup(props, { slots }) {
    const baseUrl = computed(() => resolveBaseUrl(props.baseUrl));
    const state = reactive<{ user: User | null; loading: boolean; error: string | null }>({
      user: null,
      loading: true,
      error: null,
    });

    const refreshUser = async () => {
      state.loading = true;
      try {
        const response = await apiRequest<{ user: User }>(baseUrl.value, '/auth/me');
        if (response.success && response.data) {
          state.user = response.data.user;
          state.error = null;
        } else {
          state.user = null;
          state.error = response.error ?? null;
        }
      } catch (err) {
        state.user = null;
        state.error = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
      } finally {
        state.loading = false;
      }
    };

    onMounted(() => {
      void refreshUser();
    });

    const signUp = async (email: string, password: string) => {
      const response = await apiRequest<{ user: User }>(baseUrl.value, '/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (response.success && response.data) {
        state.user = response.data.user;
        state.error = null;
      } else {
        state.error = response.error ?? 'UNKNOWN_ERROR';
      }
      return response;
    };

    const signIn = async (email: string, password: string) => {
      const response = await apiRequest<{ user: User }>(baseUrl.value, '/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (response.success && response.data) {
        state.user = response.data.user;
        state.error = null;
      } else {
        state.error = response.error ?? 'UNKNOWN_ERROR';
      }
      return response;
    };

    const signInWithOAuth = (provider: OAuthProvider) => {
      window.location.href = `${baseUrl.value}/auth/oauth/${provider}`;
    };

    const signOut = async () => {
      const response = await apiRequest(baseUrl.value, '/auth/logout', { method: 'POST' });
      if (response.success) {
        state.user = null;
      }
      return response;
    };

    const verifyEmail = async (token: string): Promise<ApiResponse<{ verified: boolean }>> =>
      apiRequest<{ verified: boolean }>(baseUrl.value, '/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });

    const requestPasswordReset = async (
      email: string,
    ): Promise<ApiResponse<{ requested: boolean }>> =>
      apiRequest<{ requested: boolean }>(baseUrl.value, '/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

    const resetPassword = async (
      token: string,
      newPassword: string,
    ): Promise<ApiResponse<{ reset: boolean }>> =>
      apiRequest<{ reset: boolean }>(baseUrl.value, '/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });

    const context: AuthContextValue = {
      user: toRef(state, 'user'),
      loading: toRef(state, 'loading'),
      error: toRef(state, 'error'),
      signUp,
      signIn,
      signInWithOAuth,
      signOut,
      verifyEmail,
      requestPasswordReset,
      resetPassword,
      refreshUser,
    };

    provide(AuthSymbol, context);

    return () => (slots.default ? slots.default() : h('div'));
  },
});

export function useAuth(): AuthContextValue {
  const ctx = inject<AuthContextValue | undefined>(AuthSymbol);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export function useUser(): {
  user: AuthContextValue['user'];
  loading: AuthContextValue['loading'];
  error: AuthContextValue['error'];
} {
  const ctx = useAuth();
  return {
    user: ctx.user,
    loading: ctx.loading,
    error: ctx.error,
  };
}
