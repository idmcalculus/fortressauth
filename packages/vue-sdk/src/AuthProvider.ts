import { computed, defineComponent, h, inject, onMounted, provide, reactive, toRef } from 'vue';
import type { ApiResponse, AuthContextValue, AuthProviderProps, User } from './types.js';

function resolveBaseUrl(explicit?: string): string {
  const envBaseUrl =
    typeof import.meta !== 'undefined' && typeof import.meta === 'object'
      ? // @ts-expect-error - import.meta.env is runtime Vite feature
        (import.meta.env?.VITE_API_BASE_URL ?? import.meta.env?.NEXT_PUBLIC_API_BASE_URL)
      : undefined;
  return explicit ?? envBaseUrl ?? 'http://localhost:3000';
}

async function apiRequest<T>(baseUrl: string, path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as ApiResponse<T>;
  return data;
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
    const state = reactive<{ user: User | null; loading: boolean; error: string | null }>(
      { user: null, loading: true, error: null },
    );

    const refreshUser = async () => {
      state.loading = true;
      const response = await apiRequest<{ user: User }>(baseUrl.value, '/auth/me');
      if (response.success && response.data) {
        state.user = response.data.user;
        state.error = null;
      } else {
        state.user = null;
        state.error = response.error ?? null;
      }
      state.loading = false;
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

    const signOut = async () => {
      const response = await apiRequest(baseUrl.value, '/auth/logout', { method: 'POST' });
      if (response.success) {
        state.user = null;
      }
      return response;
    };

    const verifyEmail = async (token: string): Promise<ApiResponse<{ verified: boolean }>> =>
      apiRequest<{ verified: boolean }>(baseUrl.value, '/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });

    const requestPasswordReset = async (email: string): Promise<ApiResponse<{ requested: boolean }>> =>
      apiRequest<{ requested: boolean }>(baseUrl.value, '/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email }) });

    const resetPassword = async (token: string, newPassword: string): Promise<ApiResponse<{ reset: boolean }>> =>
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

export function useUser(): { user: AuthContextValue['user']; loading: AuthContextValue['loading']; error: AuthContextValue['error'] } {
  const ctx = useAuth();
  return {
    user: ctx.user,
    loading: ctx.loading,
    error: ctx.error,
  };
}