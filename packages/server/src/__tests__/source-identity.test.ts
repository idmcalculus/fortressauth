import { describe, expect, it } from 'vitest';
import { resolveTrustedSourceIdentity } from '../security/source-identity.js';

describe('resolveTrustedSourceIdentity', () => {
  it('uses the socket address for a direct deployment', () => {
    expect(
      resolveTrustedSourceIdentity({
        trustedProxyHopCount: 0,
        forwardedFor: '198.51.100.7',
        directAddress: '203.0.113.9',
      }),
    ).toBe('203.0.113.9');
  });

  it('uses only the configured X-Forwarded-For chain behind proxies', () => {
    expect(
      resolveTrustedSourceIdentity({
        trustedProxyHopCount: 2,
        forwardedFor: '192.0.2.10, 198.51.100.20, 203.0.113.30',
        directAddress: '10.0.0.4',
      }),
    ).toBe('198.51.100.20');
  });

  it('fails closed when the configured proxy chain is missing', () => {
    expect(
      resolveTrustedSourceIdentity({
        trustedProxyHopCount: 2,
        forwardedFor: '192.0.2.10',
        directAddress: '10.0.0.4',
      }),
    ).toBe('unknown');
  });
});
