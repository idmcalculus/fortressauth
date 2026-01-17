import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkedInOAuthProvider } from '../index.js';

describe('LinkedInOAuthProvider', () => {
  const config = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/callback',
  };

  const provider = new LinkedInOAuthProvider(config);

  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noExplicitAny: Mocking global fetch
    globalThis.fetch = vi.fn() as any;
  });

  it('generates correct authorization URL', () => {
    const url = provider.getAuthorizationUrl({ state: 'test-state' });
    const parsedUrl = new URL(url);

    expect(parsedUrl.origin).toBe('https://www.linkedin.com');
    expect(parsedUrl.pathname).toBe('/oauth/v2/authorization');
    expect(parsedUrl.searchParams.get('client_id')).toBe(config.clientId);
    expect(parsedUrl.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(parsedUrl.searchParams.get('state')).toBe('test-state');
    expect(parsedUrl.searchParams.get('scope')).toBe('openid profile email');
  });

  it('validates callback and exchanges code for tokens', async () => {
    const mockTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTokens,
    } as Response);

    const result = await provider.validateCallback('test-code');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessToken).toBe(mockTokens.access_token);
    }
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://www.linkedin.com/oauth/v2/accessToken',
      expect.any(Object),
    );
  });

  it('gets user info correctly', async () => {
    const mockUser = {
      sub: 'linkedin-sub-id',
      name: 'LinkedIn User',
      email: 'linkedin@example.com',
      picture: 'https://example.com/picture.jpg',
      email_verified: true,
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser,
    } as Response);

    const result = await provider.getUserInfo('test-access-token');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(mockUser.sub);
      expect(result.data.email).toBe(mockUser.email);
      expect(result.data.name).toBe(mockUser.name);
      expect(result.data.picture).toBe(mockUser.picture);
    }
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.linkedin.com/v2/userinfo',
      expect.any(Object),
    );
  });
});
