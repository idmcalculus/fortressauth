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
  /** OAuth bearer token for provider APIs, including standard userinfo endpoints. */
  accessToken: string;
  /** OpenID Connect identity token. Do not use as a bearer token for userinfo endpoints. */
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  /**
   * Provider-verified evidence of a real authentication ceremony. Implementations must only set
   * this after validating the provider's signed claims and freshness contract.
   */
  authenticationEvidence?: {
    authenticatedAt: Date;
    providerVerified: true;
    ceremony: 'fresh';
  };
}

export interface OAuthProviderPort {
  /** Explicit opt-in. Providers without this capability fail closed for native step-up requests. */
  readonly supportsFreshAuthentication?: true;
  /**
   * Generate the authorization URL to redirect the user to.
   */
  getAuthorizationUrl(options: {
    state: string;
    codeChallenge?: string;
    scopes?: string[];
    freshAuthentication?: { maxAgeSeconds: number };
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
   *
   * This is the default userinfo path. Providers with standard userinfo endpoints
   * must expect the OAuth access token here, even when validateCallback also
   * returns an idToken.
   */
  getUserInfo(accessToken: string): Promise<Result<OAuthUser, AuthErrorCode>>;

  /**
   * Optional provider-specific userinfo hook for providers that need more than
   * the access token or whose profile data is carried by a different token.
   *
   * When omitted, FortressAuth calls getUserInfo(tokens.accessToken). Apple uses
   * this hook to parse the idToken explicitly because it does not expose a
   * standard userinfo endpoint for this flow.
   */
  getUserInfoFromTokens?(tokens: OAuthTokens): Promise<Result<OAuthUser, AuthErrorCode>>;
}
