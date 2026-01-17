import { createHash, randomBytes } from 'node:crypto';

export interface PKCE {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * Generates a PKCE code verifier and challenge.
 * The code verifier is a high-entropy cryptographic random string using unreserved characters [A-Z, a-z, 0-9, "-", ".", "_", "~"].
 */
export function generatePKCE(): PKCE {
  // 32 bytes (256 bits) of entropy, base64url encoded
  const verifier = randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return {
    codeVerifier: verifier,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
  };
}

/**
 * Generates a secure random state for CSRF protection.
 */
export function generateState(): string {
  return randomBytes(32).toString('hex');
}
