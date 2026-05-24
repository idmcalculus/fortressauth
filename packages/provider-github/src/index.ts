import type { OAuthProviderPort, OAuthTokens, OAuthUser, Result } from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';
import { httpJson } from '@fortressauth/oauth-core';

export interface GitHubProviderConfig {
  clientId: string;
  clientSecret: string;
}

interface GitHubTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  id_token?: unknown;
  error?: unknown;
}

interface GitHubUserResponse {
  id?: unknown;
  login?: unknown;
  name?: unknown;
  email?: unknown;
  avatar_url?: unknown;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export class GitHubOAuthProvider implements OAuthProviderPort {
  private readonly authUrl = 'https://github.com/login/oauth/authorize';
  private readonly tokenUrl = 'https://github.com/login/oauth/access_token';
  private readonly userInfoUrl = 'https://api.github.com/user';
  private readonly userEmailsUrl = 'https://api.github.com/user/emails';

  constructor(private readonly config: GitHubProviderConfig) {}

  getAuthorizationUrl(options: {
    state: string;
    codeChallenge?: string;
    scopes?: string[];
  }): string {
    const url = new URL(this.authUrl);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('state', options.state);
    url.searchParams.set('scope', (options.scopes ?? ['read:user', 'user:email']).join(' '));

    // GitHub does not natively support PKCE for OAuth Apps (only for GitHub Apps),
    // but we support it in the interface for future-proofing or if users use it.
    // For standard OAuth Apps, code_challenge will be ignored by GitHub.

    return url.toString();
  }

  async validateCallback(
    code: string,
    _options?: { codeVerifier?: string },
  ): Promise<Result<OAuthTokens, 'OAUTH_AUTH_FAILED'>> {
    const result = await httpJson<GitHubTokenResponse>(this.tokenUrl, {
      provider: 'github',
      operation: 'token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
      }),
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

  async getUserInfo(accessToken: string): Promise<Result<OAuthUser, 'OAUTH_USER_INFO_FAILED'>> {
    const userResult = await httpJson<GitHubUserResponse>(this.userInfoUrl, {
      provider: 'github',
      operation: 'userinfo',
      errorCode: 'OAUTH_USER_INFO_FAILED',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'FortressAuth',
      },
    });

    if (!userResult.success) {
      return err('OAUTH_USER_INFO_FAILED');
    }

    const userData = userResult.data;
    if (userData.id === undefined || userData.id === null) {
      return err('OAUTH_USER_INFO_FAILED');
    }

    // GitHub often requires a separate call to get emails if not public.
    // Failure here is treated as "no email available" rather than a hard
    // error so we can fall back to userData.email below.
    let email = typeof userData.email === 'string' ? userData.email : null;
    let emailVerified = false;

    const emailsResult = await httpJson<GitHubEmail[]>(this.userEmailsUrl, {
      provider: 'github',
      operation: 'emails',
      errorCode: 'OAUTH_USER_INFO_FAILED',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'FortressAuth',
      },
    });

    if (emailsResult.success && Array.isArray(emailsResult.data)) {
      const emails = emailsResult.data;
      const primaryEmail = emails.find((e) => e.primary) || emails[0];
      if (primaryEmail) {
        email = primaryEmail.email;
        emailVerified = primaryEmail.verified;
      }
    }

    if (!email) {
      return err('OAUTH_USER_INFO_FAILED');
    }

    const idStr = String(userData.id);
    const displayName =
      typeof userData.name === 'string' && userData.name.length > 0
        ? userData.name
        : typeof userData.login === 'string'
          ? userData.login
          : undefined;

    return ok({
      id: idStr,
      email,
      emailVerified,
      ...(displayName ? { name: displayName } : {}),
      ...(typeof userData.avatar_url === 'string' ? { picture: userData.avatar_url } : {}),
    });
  }
}
