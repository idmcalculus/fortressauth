import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface SplitToken {
  selector: string;
  verifier: string;
  verifierHash: string;
  token: string;
}

export function generateSplitToken(): SplitToken {
  const selector = randomBytes(16).toString('hex');
  const verifier = randomBytes(32).toString('hex');
  const verifierHash = hashVerifier(verifier);
  const token = `${selector}:${verifier}`;

  return { selector, verifier, verifierHash, token };
}

export function hashVerifier(verifier: string): string {
  return createHash('sha256').update(verifier).digest('hex');
}

export function parseSplitToken(rawToken: string): { selector: string; verifier: string } | null {
  const [selector, verifier] = rawToken.split(':');
  if (!selector || !verifier) {
    return null;
  }
  return { selector, verifier };
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
