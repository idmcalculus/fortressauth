import { Buffer } from 'node:buffer';
import type {
  AuthErrorCode,
  OAuthProviderPort,
  OAuthTokens,
  OAuthUser,
  Result,
} from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';
import { httpJson } from '@fortressauth/oauth-core';

export interface TwitterProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

interface TwitterTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
}

interface TwitterUserResponse {
  data?: {
    id?: unknown;
    name?: unknown;
    username?: unknown;
    email?: unknown;
    profile_image_url?: unknown;
    verified?: unknown;
  };
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

    const result = await httpJson<TwitterTokenResponse>('https://api.twitter.com/2/oauth2/token', {
      provider: 'twitter',
      operation: 'token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body: params.toString(),
    });

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
    // Twitter API v2 users/me. To get email, the app must have 'email' scope and permission.
    const result = await httpJson<TwitterUserResponse>(
      'https://api.twitter.com/2/users/me?user.fields=profile_image_url,verified,email',
      {
        provider: 'twitter',
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

    const userData = result.data.data;
    if (
      !userData ||
      typeof userData.id !== 'string' ||
      typeof userData.email !== 'string' ||
      typeof userData.name !== 'string'
    ) {
      return err('OAUTH_USER_INFO_FAILED');
    }

    // Twitter's "verified" flag is not an email verification signal.
    return ok({
      id: userData.id,
      email: userData.email,
      emailVerified: false,
      name: userData.name,
      ...(typeof userData.profile_image_url === 'string'
        ? { picture: userData.profile_image_url }
        : {}),
    });
  }
}
