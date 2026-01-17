import type {
  AuthErrorCode,
  OAuthProviderPort,
  OAuthTokens,
  OAuthUser,
  Result,
} from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';

const DEFAULT_TENANT = 'common';

export interface MicrosoftProviderConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  /** Tenant ID or well-known values like 'common', 'organizations', 'consumers'. */
  tenantId?: string;
  scopes?: string[];
}

export class MicrosoftOAuthProvider implements OAuthProviderPort {
  private readonly config: MicrosoftProviderConfig;
  private readonly defaultScopes = ['openid', 'email', 'profile'];

  constructor(config: MicrosoftProviderConfig) {
    this.config = config;
  }

  private getAuthority(): string {
    const tenant = this.config.tenantId ?? DEFAULT_TENANT;
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
  }

  getAuthorizationUrl(options: {
    state: string;
    codeChallenge?: string;
    scopes?: string[];
  }): string {
    const url = new URL(`${this.getAuthority()}/authorize`);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('state', options.state);
    url.searchParams.set(
      'scope',
      (options.scopes ?? this.config.scopes ?? this.defaultScopes).join(' '),
    );

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

      if (this.config.clientSecret) {
        params.set('client_secret', this.config.clientSecret);
      }
      if (options?.codeVerifier) {
        params.set('code_verifier', options.codeVerifier);
      }

      const response = await fetch(`${this.getAuthority()}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
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
        id_token?: string;
        error?: string;
      };

      if (data.error) {
        return err('OAUTH_AUTH_FAILED');
      }

      return ok({
        accessToken: data.access_token,
        ...(data.refresh_token && { refreshToken: data.refresh_token }),
        ...(data.expires_in && { expiresIn: data.expires_in }),
        ...(data.id_token && { idToken: data.id_token }),
      });
    } catch (_error) {
      return err('OAUTH_AUTH_FAILED');
    }
  }

  async getUserInfo(accessToken: string): Promise<Result<OAuthUser, AuthErrorCode>> {
    try {
      const response = await fetch('https://graph.microsoft.com/oidc/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      const data = (await response.json()) as {
        sub?: string;
        email?: string;
        preferred_username?: string;
        upn?: string;
        unique_name?: string;
        name?: string;
        email_verified?: boolean;
        picture?: string;
      };

      const email = data.email ?? data.preferred_username ?? data.upn ?? data.unique_name;

      if (!data.sub || !email) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      const name = data.name ?? data.preferred_username ?? data.unique_name;

      return ok({
        id: data.sub,
        email,
        emailVerified: data.email_verified ?? false,
        ...(name && { name }),
        ...(data.picture && { picture: data.picture }),
      });
    } catch (_error) {
      return err('OAUTH_USER_INFO_FAILED');
    }
  }
}
