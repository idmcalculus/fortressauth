import type { Ref } from 'vue';

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
  user: Ref<User | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  signUp: (email: string, password: string) => Promise<ApiResponse<{ user: User }>>;
  signIn: (email: string, password: string) => Promise<ApiResponse<{ user: User }>>;
  signInWithOAuth: (provider: OAuthProvider) => void;
  signOut: () => Promise<ApiResponse<unknown>>;
  verifyEmail: (token: string) => Promise<ApiResponse<{ verified: boolean }>>;
  requestPasswordReset: (email: string) => Promise<ApiResponse<{ requested: boolean }>>;
  resetPassword: (token: string, newPassword: string) => Promise<ApiResponse<{ reset: boolean }>>;
  refreshUser: () => Promise<void>;
}

export interface AuthProviderProps {
  baseUrl?: string;
}
