import type { AuthErrorCode } from '../types/errors.js';
import type { Result } from '../types/result.js';

export interface OAuthUser {
  /** Provider-specific user ID */
  id: string;
  /** Normalized email address */
  email: string;
  /** Whether the email is verified by the provider */
  emailVerified: boolean;
  /** User's display name, if available */
  name?: string;
  /** User's profile picture URL, if available */
  picture?: string;
}

export interface OAuthTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface OAuthProviderPort {
  /**
   * Generate the authorization URL to redirect the user to.
   */
  getAuthorizationUrl(options: {
    state: string;
    codeChallenge?: string;
    scopes?: string[];
  }): string;

  /**
   * Exchange the authorization code for tokens.
   */
  validateCallback(
    code: string,
    options?: {
      codeVerifier?: string;
    },
  ): Promise<Result<OAuthTokens, AuthErrorCode>>;

  /**
   * Get user information using the access token.
   */
  getUserInfo(accessToken: string): Promise<Result<OAuthUser, AuthErrorCode>>;
}
