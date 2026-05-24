import { describe, expect, it } from 'vitest';
import { getLiveDemoUrl } from '../demo-config';

describe('getLiveDemoUrl', () => {
  it('defaults to the local React demo path outside production', () => {
    expect(getLiveDemoUrl({})).toBe('/react-demo');
  });

  it('defaults to the production React demo subdomain in production', () => {
    expect(getLiveDemoUrl({ NODE_ENV: 'production' })).toBe('https://react-demo.fortressauth.com');
  });

  it('ignores blank configured URLs', () => {
    expect(
      getLiveDemoUrl({
        NEXT_PUBLIC_LIVE_DEMO_URL: '   ',
        NODE_ENV: 'production',
      }),
    ).toBe('https://react-demo.fortressauth.com');
  });

  it('normalizes configured absolute URLs', () => {
    expect(
      getLiveDemoUrl({
        NEXT_PUBLIC_LIVE_DEMO_URL: ' https://demo.example.com/ ',
      }),
    ).toBe('https://demo.example.com');
  });

  it('normalizes configured path URLs', () => {
    expect(
      getLiveDemoUrl({
        NEXT_PUBLIC_LIVE_DEMO_URL: 'demo',
      }),
    ).toBe('/demo');
  });
});
