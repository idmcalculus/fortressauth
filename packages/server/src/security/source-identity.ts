export interface TrustedSourceIdentityInput {
  trustedProxyHopCount: number;
  forwardedFor?: string | undefined;
  directAddress?: string | undefined;
}

/**
 * Resolves the rate-limit identity without trusting caller-controlled fallback
 * headers. Direct deployments use the socket address. Proxy deployments use
 * only X-Forwarded-For and require the configured chain depth to be present.
 */
export function resolveTrustedSourceIdentity(input: TrustedSourceIdentityInput): string {
  if (input.trustedProxyHopCount <= 0) {
    return input.directAddress?.trim() || 'unknown';
  }

  const parts = (input.forwardedFor ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < input.trustedProxyHopCount) return 'unknown';
  return parts[parts.length - input.trustedProxyHopCount] ?? 'unknown';
}
