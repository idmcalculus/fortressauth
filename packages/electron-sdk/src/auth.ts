import { getDefaultStorage } from './storage.js';
import type {
  ApiResponse,
  AuthConfig,
  AuthState,
  AuthStateListener,
  AuthStorage,
  OAuthProvider,
  User,
} from './types.js';

const TOKEN_STORAGE_KEY = 'auth_token';

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

    if (token) {
      headers.Authorization = `Bearer ${token}`;
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

/**
 * FortressAuth client for Electron applications.
 * Uses electron-store for secure token persistence.
 */
export class FortressAuth {
  private readonly baseUrl: string;
  private readonly storage: AuthStorage;
  private state: AuthState = { user: null, loading: true, error: null };
  private listeners: Set<AuthStateListener> = new Set();
  private token: string | null = null;

  constructor(config?: AuthConfig & { storage?: AuthStorage }) {
    this.baseUrl = resolveBaseUrl(config?.baseUrl);
    this.storage = config?.storage ?? getDefaultStorage(config?.storagePrefix);
    this.init();
  }

  private async init() {
    const storedToken = await this.storage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      this.token = storedToken;
      await this.refreshUser();
    } else {
      this.updateState({ loading: false });
    }
  }

  private updateState(partial: Partial<AuthState>) {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  /**
   * Subscribe to auth state changes.
   * @returns Unsubscribe function
   */
  subscribe(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get current auth state.
   */
  getState(): AuthState {
    return { ...this.state };
  }

  /**
   * Get current user.
   */
  get user(): User | null {
    return this.state.user;
  }

  /**
   * Get loading state.
   */
  get loading(): boolean {
    return this.state.loading;
  }

  /**
   * Get error state.
   */
  get error(): string | null {
    return this.state.error;
  }

  async refreshUser(): Promise<void> {
    this.updateState({ loading: true });
    const response = await apiRequest<{ user: User }>(
      this.baseUrl,
      '/auth/me',
      undefined,
      this.token,
    );
    if (response.success && response.data) {
      this.updateState({ user: response.data.user, error: null, loading: false });
    } else {
      this.updateState({ user: null, error: response.error ?? null, loading: false });
    }
  }

  async signUp(email: string, password: string): Promise<ApiResponse<{ user: User }>> {
    const response = await apiRequest<{ user: User; token?: string }>(
      this.baseUrl,
      '/auth/signup',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    );
    if (response.success && response.data) {
      this.updateState({ user: response.data.user, error: null });
      if (response.data.token) {
        this.token = response.data.token;
        await this.storage.setItem(TOKEN_STORAGE_KEY, response.data.token);
      }
    } else {
      this.updateState({ error: response.error ?? 'UNKNOWN_ERROR' });
    }
    return response as ApiResponse<{ user: User }>;
  }

  async signIn(email: string, password: string): Promise<ApiResponse<{ user: User }>> {
    const response = await apiRequest<{ user: User; token?: string }>(this.baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (response.success && response.data) {
      this.updateState({ user: response.data.user, error: null });
      if (response.data.token) {
        this.token = response.data.token;
        await this.storage.setItem(TOKEN_STORAGE_KEY, response.data.token);
      }
    } else {
      this.updateState({ error: response.error ?? 'UNKNOWN_ERROR' });
    }
    return response as ApiResponse<{ user: User }>;
  }

  signInWithOAuth(provider: OAuthProvider): void {
    if (typeof window !== 'undefined') {
      window.location.href = `${this.baseUrl}/auth/oauth/${provider}`;
    }
  }

  async signOut(): Promise<ApiResponse<unknown>> {
    const response = await apiRequest(this.baseUrl, '/auth/logout', { method: 'POST' }, this.token);
    if (response.success) {
      this.updateState({ user: null });
      this.token = null;
      await this.storage.removeItem(TOKEN_STORAGE_KEY);
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

/**
 * Create a FortressAuth client for Electron.
 */
export function createAuth(config?: AuthConfig): FortressAuth {
  return new FortressAuth(config);
}
