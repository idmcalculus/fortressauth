export type {
  ApiResponse,
  AuthorizationRequest,
  DesktopAuthConfig as AuthConfig,
  DesktopAuthState as AuthState,
  NativeOAuthProvider as OAuthProvider,
  SecureAuthStorage as AuthStorage,
  User,
} from '@fortressauth/desktop-sdk';
export type AuthStateListener = (
  state: import('@fortressauth/desktop-sdk').DesktopAuthState,
) => void;
