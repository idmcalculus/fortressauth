import { Injectable, InjectionToken, Inject, Optional } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { ApiResponse, AuthState, User, AuthConfig } from './types.js';

export const AUTH_CONFIG = new InjectionToken<AuthConfig>('AUTH_CONFIG');

function resolveBaseUrl(explicit?: string): string {
	// Check for environment variable in browser context
	if (typeof window !== 'undefined') {
		// @ts-expect-error - env is injected at build time
		const envUrl = window.__FORTRESS_API_URL__;
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

	constructor(@Optional() @Inject(AUTH_CONFIG) config?: AuthConfig) {
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
