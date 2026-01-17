import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubOAuthProvider } from '../index.js';

describe('GitHubOAuthProvider', () => {
  const config = {
    clientId: 'client-id',
    clientSecret: 'client-secret',
  };
  let provider: GitHubOAuthProvider;

  beforeEach(() => {
    provider = new GitHubOAuthProvider(config);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('generates correct authorization URL', () => {
    const url = provider.getAuthorizationUrl({ state: 'test-state' });
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://github.com');
    expect(parsed.searchParams.get('client_id')).toBe(config.clientId);
    expect(parsed.searchParams.get('state')).toBe('test-state');
    expect(parsed.searchParams.get('scope')).toBe('read:user user:email');
  });

  it('validates callback and exchanges code for tokens', async () => {
    const mockTokens = {
      access_token: 'at',
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
    }

    expect(fetch).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('gets user info correctly with separate email fetch', async () => {
    const mockUserInfo = {
      id: 12345,
      login: 'ghuser',
      name: 'GitHub User',
      avatar_url: 'http://avatar.url',
    };
    const mockEmails = [{ email: 'user@example.com', primary: true, verified: true }];

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserInfo,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockEmails,
      } as Response);

    const result = await provider.getUserInfo('access-token');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('12345');
      expect(result.data.email).toBe('user@example.com');
      expect(result.data.emailVerified).toBe(true);
    }
  });

  it('handles user info failure gracefully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
    } as Response);

    const result = await provider.getUserInfo('access-token');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('OAUTH_USER_INFO_FAILED');
    }
  });
});
