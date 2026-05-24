import type {
  AuthErrorCode,
  OAuthProviderPort,
  OAuthTokens,
  OAuthUser,
  Result,
} from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';
import { httpJson } from '@fortressauth/oauth-core';

const DEFAULT_TENANT = 'common';

export interface MicrosoftProviderConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  /** Tenant ID or well-known values like 'common', 'organizations', 'consumers'. */
  tenantId?: string;
  scopes?: string[];
}

interface MicrosoftTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  id_token?: unknown;
  error?: unknown;
}

interface MicrosoftUserInfoResponse {
  sub?: unknown;
  email?: unknown;
  preferred_username?: unknown;
  upn?: unknown;
  unique_name?: unknown;
  name?: unknown;
  email_verified?: unknown;
  picture?: unknown;
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

    const result = await httpJson<MicrosoftTokenResponse>(`${this.getAuthority()}/token`, {
      provider: 'microsoft',
      operation: 'token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!result.success) {
      return err('OAUTH_AUTH_FAILED');
    }

    const data = result.data;
    if (data.error || typeof data.access_token !== 'string') {
      return err('OAUTH_AUTH_FAILED');
    }

    return ok({
      accessToken: data.access_token,
      ...(typeof data.refresh_token === 'string' ? { refreshToken: data.refresh_token } : {}),
      ...(typeof data.expires_in === 'number' ? { expiresIn: data.expires_in } : {}),
      ...(typeof data.id_token === 'string' ? { idToken: data.id_token } : {}),
    });
  }

  async getUserInfo(accessToken: string): Promise<Result<OAuthUser, AuthErrorCode>> {
    const result = await httpJson<MicrosoftUserInfoResponse>(
      'https://graph.microsoft.com/oidc/userinfo',
      {
        provider: 'microsoft',
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
    const sub = typeof data.sub === 'string' ? data.sub : null;
    const email =
      typeof data.email === 'string'
        ? data.email
        : typeof data.preferred_username === 'string'
          ? data.preferred_username
          : typeof data.upn === 'string'
            ? data.upn
            : typeof data.unique_name === 'string'
              ? data.unique_name
              : null;

    if (!sub || !email) {
      return err('OAUTH_USER_INFO_FAILED');
    }

    const name =
      typeof data.name === 'string'
        ? data.name
        : typeof data.preferred_username === 'string'
          ? data.preferred_username
          : typeof data.unique_name === 'string'
            ? data.unique_name
            : undefined;

    return ok({
      id: sub,
      email,
      emailVerified: data.email_verified === true,
      ...(name ? { name } : {}),
      ...(typeof data.picture === 'string' ? { picture: data.picture } : {}),
    });
  }
}
