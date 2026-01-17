import type { ReactNode } from 'react';

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

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signUp: (email: string, password: string) => Promise<ApiResponse<{ user: User }>>;
  signIn: (email: string, password: string) => Promise<ApiResponse<{ user: User }>>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  signOut: () => Promise<ApiResponse<unknown>>;
  verifyEmail: (token: string) => Promise<ApiResponse<unknown>>;
  requestPasswordReset: (email: string) => Promise<ApiResponse<unknown>>;
  resetPassword: (token: string, newPassword: string) => Promise<ApiResponse<unknown>>;
  refreshUser: () => Promise<void>;
}

export interface AuthProviderProps {
  children: ReactNode;
  baseUrl?: string;
}

/**
 * Storage interface for persisting auth tokens.
 * Implement this interface to use custom storage (e.g., SecureStore for Expo).
 */
export interface AuthStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export type OAuthProvider =
  | 'google'
  | 'github'
  | 'apple'
  | 'discord'
  | 'linkedin'
  | 'twitter'
  | 'microsoft';
