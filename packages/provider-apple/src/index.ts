import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import type { OAuthProviderPort, OAuthTokens, OAuthUser, Result } from '@fortressauth/core';
import { err, ok } from '@fortressauth/core';

const APPLE_AUDIENCE = 'https://appleid.apple.com';
const DEFAULT_CLIENT_SECRET_TTL_SECONDS = 5 * 60;
const MAX_CLIENT_SECRET_TTL_SECONDS = 6 * 30 * 24 * 60 * 60;

function base64UrlEncode(value: string | Buffer): string {
  const buffer = typeof value === 'string' ? Buffer.from(value) : value;
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(value: string): string {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  if (pad) {
    normalized += '='.repeat(4 - pad);
  }
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function normalizePrivateKey(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

export interface AppleProviderConfig {
  clientId: string; // Services ID
  teamId: string;
  keyId: string;
  redirectUri: string;
  clientSecret?: string; // Optional: provide a pre-generated secret
  privateKey?: string; // Required to generate a client secret if not provided
  clientSecretExpiresIn?: number; // Seconds, max 6 months per Apple docs
}

export class AppleOAuthProvider implements OAuthProviderPort {
  private readonly authUrl = 'https://appleid.apple.com/auth/authorize';
  private readonly tokenUrl = 'https://appleid.apple.com/auth/token';
  private cachedClientSecret: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: AppleProviderConfig) {}

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
    url.searchParams.set('scope', (options.scopes ?? ['name', 'email']).join(' '));
    url.searchParams.set('response_mode', 'form_post'); // Required for name/email

    if (options.codeChallenge) {
      url.searchParams.set('code_challenge', options.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    return url.toString();
  }

  private getClientSecret(): string {
    if (this.config.clientSecret) {
      return this.config.clientSecret;
    }

    const now = Math.floor(Date.now() / 1000);
    const cached = this.cachedClientSecret;
    if (cached && cached.expiresAt - 30 > now) {
      return cached.value;
    }

    if (!this.config.privateKey) {
      throw new Error('Apple privateKey is required to generate clientSecret');
    }

    const requestedTtl = this.config.clientSecretExpiresIn ?? DEFAULT_CLIENT_SECRET_TTL_SECONDS;
    const expiresIn = Math.min(Math.max(requestedTtl, 1), MAX_CLIENT_SECRET_TTL_SECONDS);
    const exp = now + expiresIn;

    const header = {
      alg: 'ES256',
      kid: this.config.keyId,
      typ: 'JWT',
    };
    const payload = {
      iss: this.config.teamId,
      iat: now,
      exp,
      aud: APPLE_AUDIENCE,
      sub: this.config.clientId,
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signer = createSign('SHA256');
    signer.update(signingInput);
    signer.end();

    const signature = signer.sign({
      key: normalizePrivateKey(this.config.privateKey),
      dsaEncoding: 'ieee-p1363',
    });
    const clientSecret = `${signingInput}.${base64UrlEncode(signature)}`;

    this.cachedClientSecret = { value: clientSecret, expiresAt: exp };
    return clientSecret;
  }

  async validateCallback(
    code: string,
    options?: { codeVerifier?: string },
  ): Promise<Result<OAuthTokens, 'OAUTH_AUTH_FAILED'>> {
    try {
      const clientSecret = this.getClientSecret();

      const params = new URLSearchParams();
      params.set('client_id', this.config.clientId);
      params.set('client_secret', clientSecret);
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
    // For Apple, user info is contained in the ID token (JWT).
    try {
      const parts = accessToken.split('.');
      if (parts.length !== 3) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      const payload = JSON.parse(base64UrlDecode(parts[1] || '')) as {
        sub?: string;
        email?: string;
        email_verified?: boolean | string;
        aud?: string | string[];
        iss?: string;
        exp?: number;
      };

      const now = Math.floor(Date.now() / 1000);
      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!payload.iss || payload.iss !== APPLE_AUDIENCE) {
        return err('OAUTH_USER_INFO_FAILED');
      }
      if (!payload.sub || !payload.email) {
        return err('OAUTH_USER_INFO_FAILED');
      }
      if (!aud.includes(this.config.clientId)) {
        return err('OAUTH_USER_INFO_FAILED');
      }
      if (!payload.exp || payload.exp <= now) {
        return err('OAUTH_USER_INFO_FAILED');
      }

      return ok({
        id: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified === 'true' || payload.email_verified === true,
        name: '', // Name is only in the initial request, not the JWT
      });
    } catch (_error) {
      return err('OAUTH_USER_INFO_FAILED');
    }
  }
}
