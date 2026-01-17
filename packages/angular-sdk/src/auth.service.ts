import { Injectable, InjectionToken } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { ApiResponse, AuthConfig, AuthState, OAuthProvider, User } from './types.js';

export const AUTH_CONFIG = new InjectionToken<AuthConfig>('AUTH_CONFIG');

const CSRF_COOKIE_NAME = 'fortress_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const csrfTokenCache = new Map<string, string>();
const csrfPromiseCache = new Map<string, Promise<string>>();

declare global {
  interface Window {
    __FORTRESS_API_URL__?: string;
  }
}

function resolveBaseUrl(explicit?: string): string {
  // Check for environment variable in browser context
  if (typeof window !== 'undefined') {
    const envUrl = window.__FORTRESS_API_URL__;
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

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly baseUrl: string;
  private readonly stateSubject = new BehaviorSubject<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  readonly state$: Observable<AuthState> = this.stateSubject.asObservable();

  get user$(): Observable<User | null> {
    return new Observable((subscriber) => {
      this.stateSubject.subscribe((state) => subscriber.next(state.user));
    });
  }

  get loading$(): Observable<boolean> {
    return new Observable((subscriber) => {
      this.stateSubject.subscribe((state) => subscriber.next(state.loading));
    });
  }

  get error$(): Observable<string | null> {
    return new Observable((subscriber) => {
      this.stateSubject.subscribe((state) => subscriber.next(state.error));
    });
  }

  get currentUser(): User | null {
    return this.stateSubject.getValue().user;
  }

  get isLoading(): boolean {
    return this.stateSubject.getValue().loading;
  }

  get currentError(): string | null {
    return this.stateSubject.getValue().error;
  }

  constructor(config?: AuthConfig) {
    this.baseUrl = resolveBaseUrl(config?.baseUrl);
    this.refreshUser();
  }

  private updateState(partial: Partial<AuthState>): void {
    this.stateSubject.next({
      ...this.stateSubject.getValue(),
      ...partial,
    });
  }

  async refreshUser(): Promise<void> {
    this.updateState({ loading: true });
    const response = await apiRequest<{ user: User }>(this.baseUrl, '/auth/me');
    if (response.success && response.data) {
      this.updateState({
        user: response.data.user,
        error: null,
        loading: false,
      });
    } else {
      this.updateState({
        user: null,
        error: response.error ?? null,
        loading: false,
      });
    }
  }

  async signUp(email: string, password: string): Promise<ApiResponse<{ user: User }>> {
    const response = await apiRequest<{ user: User }>(this.baseUrl, '/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (response.success && response.data) {
      this.updateState({ user: response.data.user, error: null });
    } else {
      this.updateState({ error: response.error ?? 'UNKNOWN_ERROR' });
    }
    return response;
  }

  async signIn(email: string, password: string): Promise<ApiResponse<{ user: User }>> {
    const response = await apiRequest<{ user: User }>(this.baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (response.success && response.data) {
      this.updateState({ user: response.data.user, error: null });
    } else {
      this.updateState({ error: response.error ?? 'UNKNOWN_ERROR' });
    }
    return response;
  }

  signInWithOAuth(provider: OAuthProvider): void {
    if (typeof window !== 'undefined') {
      window.location.href = `${this.baseUrl}/auth/oauth/${provider}`;
    }
  }

  async signOut(): Promise<ApiResponse<unknown>> {
    const response = await apiRequest(this.baseUrl, '/auth/logout', {
      method: 'POST',
    });
    if (response.success) {
      this.updateState({ user: null });
    }
    return response;
  }

  async verifyEmail(token: string): Promise<ApiResponse<{ verified: boolean }>> {
    return apiRequest<{ verified: boolean }>(this.baseUrl, '/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async requestPasswordReset(email: string): Promise<ApiResponse<{ requested: boolean }>> {
    return apiRequest<{ requested: boolean }>(this.baseUrl, '/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<ApiResponse<{ reset: boolean }>> {
    return apiRequest<{ reset: boolean }>(this.baseUrl, '/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  }
}
