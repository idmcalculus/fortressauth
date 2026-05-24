import type {
  AuthErrorCode,
  OAuthProviderPort,
  OAuthTokens,
  OAuthUser,
  Result,
} from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';
import { httpJson } from '@fortressauth/oauth-core';

export interface LinkedInProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

interface LinkedInTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
}

interface LinkedInUserInfoResponse {
  sub?: unknown;
  email?: unknown;
  name?: unknown;
  picture?: unknown;
  email_verified?: unknown;
}

export class LinkedInOAuthProvider implements OAuthProviderPort {
  private readonly config: LinkedInProviderConfig;
  private readonly defaultScopes = ['openid', 'profile', 'email'];

  constructor(config: LinkedInProviderConfig) {
    this.config = config;
  }

  getAuthorizationUrl(options: { state: string; codeChallenge?: string }): string {
    const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', options.state);
    url.searchParams.set('scope', (this.config.scopes ?? this.defaultScopes).join(' '));

    if (options.codeChallenge) {
      url.searchParams.set('code_challenge', options.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    return url.toString();
  }

  async validateCallback(
    code: string,
    options?: { codeVerifier?: string },
  ): Promise<Result<OAuthTokens, AuthErrorCode>> {
    const params = new URLSearchParams();
    params.set('client_id', this.config.clientId);
    params.set('client_secret', this.config.clientSecret);
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', this.config.redirectUri);

    if (options?.codeVerifier) {
      params.set('code_verifier', options.codeVerifier);
    }

    const result = await httpJson<LinkedInTokenResponse>(
      'https://www.linkedin.com/oauth/v2/accessToken',
      {
        provider: 'linkedin',
        operation: 'token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );

    if (!result.success) {
      return err('OAUTH_AUTH_FAILED');
    }

    const data = result.data;
    if (typeof data.access_token !== 'string') {
      return err('OAUTH_AUTH_FAILED');
    }

    return ok({
      accessToken: data.access_token,
      ...(typeof data.refresh_token === 'string' ? { refreshToken: data.refresh_token } : {}),
      ...(typeof data.expires_in === 'number' ? { expiresIn: data.expires_in } : {}),
    });
  }

  async getUserInfo(accessToken: string): Promise<Result<OAuthUser, AuthErrorCode>> {
    // Modern LinkedIn (OIDC) userinfo endpoint
    const result = await httpJson<LinkedInUserInfoResponse>(
      'https://api.linkedin.com/v2/userinfo',
      {
        provider: 'linkedin',
        operation: 'userinfo',
        errorCode: 'OAUTH_USER_INFO_FAILED',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!result.success) {
      return err('OAUTH_USER_INFO_FAILED');
    }

    const data = result.data;
    if (typeof data.sub !== 'string' || typeof data.email !== 'string') {
      return err('OAUTH_USER_INFO_FAILED');
    }

    return ok({
      id: data.sub,
      email: data.email,
      emailVerified: data.email_verified === true,
      ...(typeof data.name === 'string' ? { name: data.name } : {}),
      ...(typeof data.picture === 'string' ? { picture: data.picture } : {}),
    });
  }
}
