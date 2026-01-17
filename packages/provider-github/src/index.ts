import type { OAuthProviderPort, OAuthTokens, OAuthUser, Result } from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';

export interface GitHubProviderConfig {
  clientId: string;
  clientSecret: string;
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
    try {
      const response = await fetch(this.tokenUrl, {
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

      if (!response.ok) {
        return err('OAUTH_AUTH_FAILED');
      }

      const data = await response.json();

      if (data.error) {
        return err('OAUTH_AUTH_FAILED');
      }

      return ok({
        accessToken: data.access_token,
        expiresIn: data.expires_in,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
      });
    } catch (_error) {
      return err('OAUTH_AUTH_FAILED');
    }
  }

  async getUserInfo(accessToken: string): Promise<Result<OAuthUser, 'OAUTH_USER_INFO_FAILED'>> {
    try {
      const userResponse = await fetch(this.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'FortressAuth',
        },
      });

      if (!userResponse.ok) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      const userData = await userResponse.json();

      // GitHub often requires a separate call to get emails if not public
      const emailResponse = await fetch(this.userEmailsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'FortressAuth',
        },
      });

      let email = userData.email;
      let emailVerified = false;

      if (emailResponse.ok) {
        interface GitHubEmail {
          email: string;
          primary: boolean;
          verified: boolean;
          visibility: string | null;
        }
        const emails: GitHubEmail[] = await emailResponse.json();
        const primaryEmail = emails.find((e) => e.primary) || emails[0];
        if (primaryEmail) {
          email = primaryEmail.email;
          emailVerified = primaryEmail.verified;
        }
      }

      if (!email) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      return ok({
        id: userData.id.toString(),
        email,
        emailVerified,
        name: userData.name || userData.login,
        picture: userData.avatar_url,
      });
    } catch (_error) {
      return err('OAUTH_USER_INFO_FAILED');
    }
  }
}
