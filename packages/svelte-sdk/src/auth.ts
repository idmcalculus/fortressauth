import { writable, derived } from 'svelte/store';
import type { ApiResponse, AuthState, User, AuthConfig } from './types.js';

function resolveBaseUrl(explicit?: string): string {
	if (typeof window !== 'undefined') {
		// @ts-expect-error - env is injected at build time
		const envUrl = import.meta?.env?.VITE_API_BASE_URL;
		if (envUrl) return envUrl;
	}
	return explicit ?? 'http://localhost:3000';
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

	// Initialize by fetching user
	refreshUser();

	return {
		// Stores
		subscribe: state.subscribe,
		user,
		loading,
		error,
		// Methods
		signUp,
		signIn,
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
