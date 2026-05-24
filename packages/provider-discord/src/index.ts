import type {
  AuthErrorCode,
  OAuthProviderPort,
  OAuthTokens,
  OAuthUser,
  Result,
} from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';
import { httpJson } from '@fortressauth/oauth-core';

export interface DiscordProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

interface DiscordTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
}

interface DiscordUserResponse {
  id?: unknown;
  email?: unknown;
  username?: unknown;
  avatar?: unknown;
  verified?: unknown;
}

export class DiscordOAuthProvider implements OAuthProviderPort {
  private readonly config: DiscordProviderConfig;
  private readonly defaultScopes = ['identify', 'email'];

  constructor(config: DiscordProviderConfig) {
    this.config = config;
  }

  getAuthorizationUrl(options: { state: string; codeChallenge?: string }): string {
    const url = new URL('https://discord.com/api/oauth2/authorize');
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

    const result = await httpJson<DiscordTokenResponse>('https://discord.com/api/oauth2/token', {
      provider: 'discord',
      operation: 'token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
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
    const result = await httpJson<DiscordUserResponse>('https://discord.com/api/users/@me', {
      provider: 'discord',
      operation: 'userinfo',
      errorCode: 'OAUTH_USER_INFO_FAILED',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!result.success) {
      return err('OAUTH_USER_INFO_FAILED');
    }

    const data = result.data;
    if (typeof data.id !== 'string' || typeof data.email !== 'string') {
      return err('OAUTH_USER_INFO_FAILED');
    }

    const username = typeof data.username === 'string' ? data.username : undefined;

    return ok({
      id: data.id,
      email: data.email,
      emailVerified: data.verified === true,
      ...(username ? { name: username } : {}),
      ...(typeof data.avatar === 'string'
        ? { picture: `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` }
        : {}),
    });
  }
}
