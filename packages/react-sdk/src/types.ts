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

export type OAuthProvider =
  | 'google'
  | 'github'
  | 'apple'
  | 'discord'
  | 'linkedin'
  | 'twitter'
  | 'microsoft';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signUp: (email: string, password: string) => Promise<ApiResponse<{ user: User }>>;
  signIn: (email: string, password: string) => Promise<ApiResponse<{ user: User }>>;
  signInWithOAuth: (provider: OAuthProvider) => void;
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
