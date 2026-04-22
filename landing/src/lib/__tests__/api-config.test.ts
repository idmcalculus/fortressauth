import { describe, expect, it, vi } from 'vitest';
import {
  getAuthApiOrigin,
  getDocumentationUrl,
  getPublicApiOrigin,
  isApiHealthy,
  MISSING_AUTH_API_URL_ERROR,
  requireAuthApiOrigin,
} from '../api-config';

function createEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('api-config', () => {
  it('uses AUTH_API_URL for the configured API origin', () => {
    expect(
      getAuthApiOrigin(
        createEnv({
          AUTH_API_URL: 'https://custom-api.example.com/',
        }),
      ),
    ).toBe('https://custom-api.example.com');
  });

  it('throws when AUTH_API_URL is missing', () => {
    expect(() => requireAuthApiOrigin(createEnv({}))).toThrow(MISSING_AUTH_API_URL_ERROR);
  });

  it('throws when AUTH_API_URL is invalid', () => {
    expect(() => requireAuthApiOrigin(createEnv({ AUTH_API_URL: 'localhost:5000' }))).toThrow(
      MISSING_AUTH_API_URL_ERROR,
    );
  });

  it('exposes the public API origin from NEXT_PUBLIC_AUTH_API_URL', () => {
    expect(
      getPublicApiOrigin(
        createEnv({ NEXT_PUBLIC_AUTH_API_URL: 'https://public-api.example.com/' }),
      ),
    ).toBe('https://public-api.example.com');
  });

  it('derives docs URL from AUTH_API_URL when no explicit docs URL is set', () => {
    expect(getDocumentationUrl(createEnv({ AUTH_API_URL: 'https://api.example.com/' }))).toBe(
      'https://api.example.com/docs',
    );
  });

  it('allows an explicit docs URL override', () => {
    expect(
      getDocumentationUrl(
        createEnv({
          NEXT_PUBLIC_DOCS_URL: 'https://docs.example.com/reference/',
        }),
      ),
    ).toBe('https://docs.example.com/reference');
  });

  it('returns true when the configured API is healthy', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    } as Response);

    await expect(isApiHealthy(fetchMock, 'http://localhost:5000')).resolves.toBe(true);
  });

  it('returns false when the configured API is unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));

    await expect(isApiHealthy(fetchMock, 'http://localhost:5000')).resolves.toBe(false);
  });
});
