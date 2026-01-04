import { createHash } from 'node:crypto';

type RateLimitIdentifierInput = {
  email?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
};

function fingerprintUserAgent(userAgent: string): string {
  return createHash('sha256').update(userAgent).digest('hex').slice(0, 16);
}

export function buildRateLimitIdentifier(input: RateLimitIdentifierInput): string {
  const parts: string[] = [];

  if (input.email) {
    parts.push(`email:${input.email}`);
  }

  if (input.ipAddress) {
    parts.push(`ip:${input.ipAddress}`);
  }

  if (input.userAgent) {
    parts.push(`ua:${fingerprintUserAgent(input.userAgent)}`);
  }

  return parts.length > 0 ? parts.join('|') : 'unknown';
}
