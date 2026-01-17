import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generatePKCE, generateState } from '../crypto.js';

describe('OAuth Crypto Utilities', () => {
  describe('generatePKCE', () => {
    it('should generate a valid PKCE code verifier and challenge', () => {
      const pkce = generatePKCE();

      expect(pkce.codeVerifier).toBeDefined();
      expect(pkce.codeChallenge).toBeDefined();
      expect(pkce.codeChallengeMethod).toBe('S256');
    });

    it('should generate a code verifier with valid characters', () => {
      const pkce = generatePKCE();

      // Code verifier should only contain unreserved characters
      expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it('should generate a code challenge that matches the verifier', () => {
      const pkce = generatePKCE();

      // Manually compute the expected challenge
      const expectedChallenge = createHash('sha256')
        .update(pkce.codeVerifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      expect(pkce.codeChallenge).toBe(expectedChallenge);
    });

    it('should generate unique values on each call', () => {
      const pkce1 = generatePKCE();
      const pkce2 = generatePKCE();

      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
      expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
    });
  });

  describe('generateState', () => {
    it('should generate a 64-character hex string', () => {
      const state = generateState();

      expect(state).toHaveLength(64);
      expect(state).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique values on each call', () => {
      const state1 = generateState();
      const state2 = generateState();

      expect(state1).not.toBe(state2);
    });
  });
});
