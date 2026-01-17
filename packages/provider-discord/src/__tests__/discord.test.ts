import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordOAuthProvider } from '../index.js';

describe('DiscordOAuthProvider', () => {
  const config = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/callback',
  };

  const provider = new DiscordOAuthProvider(config);

  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noExplicitAny: Mocking global fetch
    globalThis.fetch = vi.fn() as any;
  });

  it('generates correct authorization URL', () => {
    const url = provider.getAuthorizationUrl({ state: 'test-state' });
    const parsedUrl = new URL(url);

    expect(parsedUrl.origin).toBe('https://discord.com');
    expect(parsedUrl.pathname).toBe('/api/oauth2/authorize');
    expect(parsedUrl.searchParams.get('client_id')).toBe(config.clientId);
    expect(parsedUrl.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(parsedUrl.searchParams.get('state')).toBe('test-state');
    expect(parsedUrl.searchParams.get('scope')).toBe('identify email');
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

    const result = await provider.validateCallback('test-code');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessToken).toBe(mockTokens.access_token);
      expect(result.data.refreshToken).toBe(mockTokens.refresh_token);
    }
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://discord.com/api/oauth2/token',
      expect.any(Object),
    );
  });

  it('gets user info correctly', async () => {
    const mockUser = {
      id: '123456789',
      username: 'testuser',
      email: 'test@example.com',
      avatar: 'avatar_hash',
      verified: true,
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser,
    } as Response);

    const result = await provider.getUserInfo('test-access-token');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(mockUser.id);
      expect(result.data.email).toBe(mockUser.email);
      expect(result.data.name).toBe(mockUser.username);
      expect(result.data.picture).toBe(
        `https://cdn.discordapp.com/avatars/${mockUser.id}/${mockUser.avatar}.png`,
      );
    }
  });
});
