export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | DesktopAuthError;
}

export interface DesktopAuthError {
  code: string;
  message: string;
}

export interface SecureAuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type NativeOAuthProvider =
  | 'google'
  | 'github'
  | 'apple'
  | 'discord'
  | 'linkedin'
  | 'twitter'
  | 'microsoft';

export interface NativeAuthorizationOptions {
  /** One exact registered resource-server audience to bind into the issued native session. */
  audience?: string;
  /** Maximum acceptable authentication age in seconds. Unsupported providers fail closed. */
  maxAgeSeconds?: number;
}

export interface DesktopAuthConfig {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  storage: SecureAuthStorage;
  /** Optional stable namespace for isolating multiple clients in one keychain. */
  storageNamespace?: string;
  openExternal: (url: string) => Promise<void>;
  /**
   * Fetch-compatible HTTP transport. Production packaged apps should inject a native transport
   * when WebView/global fetch would be subject to browser CORS. Global fetch remains the fallback
   * for development and runtimes where it is already compatible.
   */
  fetch?: typeof fetch;
  crypto?: Crypto;
  /** Per-request timeout. Defaults to 10 seconds and is clamped to 100ms-60s. */
  requestTimeoutMs?: number;
}

export interface DesktopAuthState {
  user: User | null;
  loading: boolean;
  error: DesktopAuthError | null;
  expiresAt: string | null;
}

export interface AuthorizationRequest {
  authorizationUrl: string;
  state: string;
}
