import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppleOAuthProvider } from '../index.js';

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

describe('AppleOAuthProvider', () => {
  const config = {
    clientId: 'com.fortressauth.service',
    teamId: 'TEAMID',
    keyId: 'KEYID',
    redirectUri: 'http://localhost:3000/callback',
    clientSecret: 'header.payload.signature',
  };
  let provider: AppleOAuthProvider;

  beforeEach(() => {
    provider = new AppleOAuthProvider(config);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('generates correct authorization URL', () => {
    const url = provider.getAuthorizationUrl({ state: 'test-state' });
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://appleid.apple.com');
    expect(parsed.searchParams.get('client_id')).toBe(config.clientId);
    expect(parsed.searchParams.get('state')).toBe('test-state');
    expect(parsed.searchParams.get('response_mode')).toBe('form_post');
  });

  it('validates callback and exchanges code for tokens', async () => {
    const mockTokens = {
      access_token: 'at',
      id_token: 'it',
      refresh_token: 'rt',
      expires_in: 3600,
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTokens,
    } as Response);

    const result = await provider.validateCallback('code');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessToken).toBe(mockTokens.access_token);
      expect(result.data.idToken).toBe(mockTokens.id_token);
    }

    expect(fetch).toHaveBeenCalledWith(
      'https://appleid.apple.com/auth/token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );
  });

  it('generates client secret when not provided', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const providerWithKey = new AppleOAuthProvider({
      clientId: 'com.fortressauth.service',
      teamId: 'TEAMID',
      keyId: 'KEYID',
      redirectUri: 'http://localhost:3000/callback',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'at' }),
    } as Response);

    const result = await providerWithKey.validateCallback('code');

    expect(result.success).toBe(true);
    const requestInit = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = requestInit?.body;
    const params = body instanceof URLSearchParams ? body : new URLSearchParams(body as string);
    expect(params.get('client_secret')).toBeTruthy();
  });

  it('gets user info correctly from JWT payload', async () => {
    const payload = {
      sub: 'apple-user-123',
      email: 'user@apple.com',
      email_verified: 'true',
      aud: config.clientId,
      iss: 'https://appleid.apple.com',
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    const jwt = `header.${base64UrlEncode(JSON.stringify(payload))}.signature`;

    const result = await provider.getUserInfo(jwt);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(payload.sub);
      expect(result.data.email).toBe(payload.email);
      expect(result.data.emailVerified).toBe(true);
    }
  });

  it('handles invalid JWT gracefully', async () => {
    const result = await provider.getUserInfo('not-a-jwt');
    expect(result.success).toBe(false);
  });
});
