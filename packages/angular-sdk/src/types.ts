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
}
