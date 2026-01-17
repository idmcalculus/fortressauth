import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterOAuthProvider } from '../index.js';

describe('TwitterOAuthProvider', () => {
  const config = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/callback',
  };

  const provider = new TwitterOAuthProvider(config);

  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noExplicitAny: Mocking global fetch
    globalThis.fetch = vi.fn() as any;
  });

  it('generates correct authorization URL with PKCE', () => {
    const url = provider.getAuthorizationUrl({
      state: 'test-state',
      codeChallenge: 'test-challenge',
    });
    const parsedUrl = new URL(url);

    expect(parsedUrl.origin).toBe('https://twitter.com');
    expect(parsedUrl.pathname).toBe('/i/oauth2/authorize');
    expect(parsedUrl.searchParams.get('client_id')).toBe(config.clientId);
    expect(parsedUrl.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(parsedUrl.searchParams.get('state')).toBe('test-state');
    expect(parsedUrl.searchParams.get('code_challenge')).toBe('test-challenge');
    expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('validates callback and exchanges code for tokens', async () => {
    const mockTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTokens,
    } as Response);

    const result = await provider.validateCallback('test-code', { codeVerifier: 'test-verifier' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessToken).toBe(mockTokens.access_token);
    }

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.twitter.com/2/oauth2/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic '),
        }),
      }),
    );
  });

  it('gets user info correctly from v2 API', async () => {
    const mockUser = {
      data: {
        id: 'twitter-id',
        name: 'Twitter User',
        username: 'twitteruser',
        email: 'twitter@example.com',
        profile_image_url: 'https://example.com/pic.jpg',
        verified: true,
      },
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser,
    } as Response);

    const result = await provider.getUserInfo('test-access-token');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(mockUser.data.id);
      expect(result.data.name).toBe(mockUser.data.name);
      expect(result.data.picture).toBe(mockUser.data.profile_image_url);
    }
  });
});
