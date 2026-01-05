import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildRateLimitIdentifier } from '../../security/rate-limit-key.js';

describe('buildRateLimitIdentifier', () => {
  it('returns unknown when no inputs are provided', () => {
    expect(buildRateLimitIdentifier({})).toBe('unknown');
  });

  it('returns email-only identifiers', () => {
    expect(buildRateLimitIdentifier({ email: 'user@example.com' })).toBe('email:user@example.com');
  });

  it('returns ip-only identifiers', () => {
    expect(buildRateLimitIdentifier({ ipAddress: '203.0.113.10' })).toBe('ip:203.0.113.10');
  });

  it('hashes user agent identifiers', () => {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2)';
    const expectedHash = createHash('sha256').update(userAgent).digest('hex').slice(0, 16);

    expect(buildRateLimitIdentifier({ userAgent })).toBe(`ua:${expectedHash}`);
  });

  it('builds composite identifiers in a stable order', () => {
    const userAgent = 'ExampleAgent/1.0';
    const expectedHash = createHash('sha256').update(userAgent).digest('hex').slice(0, 16);

    expect(
      buildRateLimitIdentifier({
        email: 'user@example.com',
        ipAddress: '198.51.100.5',
        userAgent,
      }),
    ).toBe(`email:user@example.com|ip:198.51.100.5|ua:${expectedHash}`);
  });
});
