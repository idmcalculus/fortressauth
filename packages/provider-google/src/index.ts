import type { OAuthProviderPort, OAuthTokens, OAuthUser, Result } from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';

export interface GoogleProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GoogleOAuthProvider implements OAuthProviderPort {
  private readonly authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenUrl = 'https://oauth2.googleapis.com/token';
  private readonly userInfoUrl = 'https://www.googleapis.com/oauth2/v3/userinfo';

  constructor(private readonly config: GoogleProviderConfig) {}

  getAuthorizationUrl(options: {
    state: string;
    codeChallenge?: string;
    scopes?: string[];
  }): string {
    const url = new URL(this.authUrl);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', options.state);
    url.searchParams.set('scope', (options.scopes ?? ['openid', 'email', 'profile']).join(' '));

    if (options.codeChallenge) {
      url.searchParams.set('code_challenge', options.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');

    return url.toString();
  }

  async validateCallback(
    code: string,
    options?: { codeVerifier?: string },
  ): Promise<Result<OAuthTokens, 'OAUTH_AUTH_FAILED'>> {
    try {
      const params = new URLSearchParams();
      params.set('client_id', this.config.clientId);
      params.set('client_secret', this.config.clientSecret);
      params.set('code', code);
      params.set('redirect_uri', this.config.redirectUri);
      params.set('grant_type', 'authorization_code');

      if (options?.codeVerifier) {
        params.set('code_verifier', options.codeVerifier);
      }

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        return err('OAUTH_AUTH_FAILED');
      }

      const data = await response.json();

      return ok({
        accessToken: data.access_token,
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      });
    } catch (_error) {
      return err('OAUTH_AUTH_FAILED');
    }
  }

  async getUserInfo(accessToken: string): Promise<Result<OAuthUser, 'OAUTH_USER_INFO_FAILED'>> {
    try {
      const response = await fetch(this.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      const data = await response.json();

      return ok({
        id: data.sub,
        email: data.email,
        emailVerified: data.email_verified,
        name: data.name,
        picture: data.picture,
      });
    } catch (_error) {
      return err('OAUTH_USER_INFO_FAILED');
    }
  }
}
