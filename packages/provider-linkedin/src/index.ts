import type {
  AuthErrorCode,
  OAuthProviderPort,
  OAuthTokens,
  OAuthUser,
  Result,
} from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';

export interface LinkedInProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
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
    try {
      const params = new URLSearchParams();
      params.set('client_id', this.config.clientId);
      params.set('client_secret', this.config.clientSecret);
      params.set('grant_type', 'authorization_code');
      params.set('code', code);
      params.set('redirect_uri', this.config.redirectUri);

      if (options?.codeVerifier) {
        params.set('code_verifier', options.codeVerifier);
      }

      const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        return err('OAUTH_AUTH_FAILED');
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      return ok({
        accessToken: data.access_token,
        ...(data.refresh_token && { refreshToken: data.refresh_token }),
        ...(data.expires_in && { expiresIn: data.expires_in }),
      });
    } catch (_error) {
      return err('OAUTH_AUTH_FAILED');
    }
  }

  async getUserInfo(accessToken: string): Promise<Result<OAuthUser, AuthErrorCode>> {
    try {
      // Modern LinkedIn (OIDC) userinfo endpoint
      const response = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      const data = (await response.json()) as {
        sub: string;
        email?: string;
        name: string;
        picture?: string;
        email_verified?: boolean;
      };

      if (!data.sub || !data.email) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      return ok({
        id: data.sub,
        email: data.email,
        emailVerified: data.email_verified ?? false,
        name: data.name,
        ...(data.picture && { picture: data.picture }),
      });
    } catch (_error) {
      return err('OAUTH_USER_INFO_FAILED');
    }
  }
}
