export interface User {
	id: string;
	email: string;
	emailVerified: boolean;
	createdAt: string;
}

export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

export interface AuthState {
	user: User | null;
	loading: boolean;
	error: string | null;
}

export interface AuthConfig {
	baseUrl?: string;
	/** Custom storage key prefix */
	storagePrefix?: string;
}

/**
 * Storage interface for persisting auth tokens.
 */
export interface AuthStorage {
	getItem: (key: string) => Promise<string | null>;
	setItem: (key: string, value: string) => Promise<void>;
	removeItem: (key: string) => Promise<void>;
}

/**
 * Callback type for auth state changes.
 */
export type AuthStateListener = (state: AuthState) => void;
