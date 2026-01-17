import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MicrosoftOAuthProvider } from '../index.js';

describe('MicrosoftOAuthProvider', () => {
  const config = {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://localhost:3000/callback',
    tenantId: 'organizations',
  };

  let provider: MicrosoftOAuthProvider;

  beforeEach(() => {
    provider = new MicrosoftOAuthProvider(config);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('generates correct authorization URL', () => {
    const url = provider.getAuthorizationUrl({ state: 'test-state' });
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://login.microsoftonline.com');
    expect(parsed.pathname).toBe('/organizations/oauth2/v2.0/authorize');
    expect(parsed.searchParams.get('client_id')).toBe(config.clientId);
    expect(parsed.searchParams.get('state')).toBe('test-state');
    expect(parsed.searchParams.get('response_type')).toBe('code');
  });

  it('includes code challenge in authorization URL if provided', () => {
    const url = provider.getAuthorizationUrl({
      state: 'test-state',
      codeChallenge: 'challenge',
    });
    const parsed = new URL(url);

    expect(parsed.searchParams.get('code_challenge')).toBe('challenge');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
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

    const result = await provider.validateCallback('code', { codeVerifier: 'verifier' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessToken).toBe(mockTokens.access_token);
      expect(result.data.idToken).toBe(mockTokens.id_token);
    }

    expect(fetch).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }),
    );
  });

  it('gets user info correctly', async () => {
    const mockUserInfo = {
      sub: 'user-123',
      preferred_username: 'user@example.com',
      email_verified: true,
      name: 'Test User',
      picture: 'http://pic.url',
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUserInfo,
    } as Response);

    const result = await provider.getUserInfo('access-token');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(mockUserInfo.sub);
      expect(result.data.email).toBe(mockUserInfo.preferred_username);
      expect(result.data.emailVerified).toBe(true);
    }
  });
});
