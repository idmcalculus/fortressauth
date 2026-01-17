import { Buffer } from 'node:buffer';
import type {
  AuthErrorCode,
  OAuthProviderPort,
  OAuthTokens,
  OAuthUser,
  Result,
} from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';

export interface TwitterProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

export class TwitterOAuthProvider implements OAuthProviderPort {
  private readonly config: TwitterProviderConfig;
  private readonly defaultScopes = ['tweet.read', 'users.read', 'offline.access', 'email'];

  constructor(config: TwitterProviderConfig) {
    this.config = config;
  }

  getAuthorizationUrl(options: { state: string; codeChallenge?: string }): string {
    const url = new URL('https://twitter.com/i/oauth2/authorize');
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
      params.set('grant_type', 'authorization_code');
      params.set('code', code);
      params.set('redirect_uri', this.config.redirectUri);

      if (options?.codeVerifier) {
        params.set('code_verifier', options.codeVerifier);
      }

      // Twitter OAuth 2.0 uses Basic Auth for the client secret if needed,
      // or just params for Public clients. Here we use Basic Auth as it's standard.
      const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
        'base64',
      );

      const response = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
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
        token_type: string;
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
      // Twitter API v2 users/me. To get email, the app must have 'email' scope and permission.
      const response = await fetch(
        'https://api.twitter.com/2/users/me?user.fields=profile_image_url,verified,email',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      const data = (await response.json()) as {
        data: {
          id: string;
          name: string;
          username: string;
          email?: string;
          profile_image_url?: string;
          verified?: boolean;
        };
      };

      if (!data.data || !data.data.id || !data.data.email) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      // Twitter's "verified" flag is not an email verification signal.
      return ok({
        id: data.data.id,
        email: data.data.email,
        emailVerified: false,
        name: data.data.name,
        ...(data.data.profile_image_url && { picture: data.data.profile_image_url }),
      });
    } catch (_error) {
      return err('OAUTH_USER_INFO_FAILED');
    }
  }
}
