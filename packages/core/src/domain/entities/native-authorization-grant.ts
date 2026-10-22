import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { constantTimeEqual, generateSplitToken, hashVerifier } from '../../security/tokens.js';

const CODE_PART_PATTERN = /^[0-9a-f]+$/;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

export class NativeAuthorizationGrant {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly clientId: string,
    public readonly selector: string,
    public readonly verifierHash: string,
    public readonly redirectUri: string,
    public readonly codeChallenge: string,
    public readonly requestedAudience: string | null,
    public readonly requestedFreshnessSeconds: number | null,
    public readonly authenticationTime: Date | null,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
  ) {}

  static create(params: {
    userId: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    requestedAudience?: string;
    requestedFreshnessSeconds?: number;
    authenticationTime?: Date;
    ttlMs: number;
  }): { grant: NativeAuthorizationGrant; rawCode: string } {
    const { selector, verifierHash, token } = generateSplitToken();
    const createdAt = new Date();
    return {
      grant: new NativeAuthorizationGrant(
        uuidv7(),
        params.userId,
        params.clientId,
        selector,
        verifierHash,
        params.redirectUri,
        params.codeChallenge,
        params.requestedAudience ?? null,
        params.requestedFreshnessSeconds ?? null,
        params.authenticationTime ?? null,
        new Date(createdAt.getTime() + params.ttlMs),
        createdAt,
      ),
      rawCode: token,
    };
  }

  static rehydrate(data: {
    id: string;
    userId: string;
    clientId: string;
    selector: string;
    verifierHash: string;
    redirectUri: string;
    codeChallenge: string;
    requestedAudience?: string | null;
    requestedFreshnessSeconds?: number | null;
    authenticationTime?: Date | null;
    expiresAt: Date;
    createdAt: Date;
  }): NativeAuthorizationGrant {
    return new NativeAuthorizationGrant(
      data.id,
      data.userId,
      data.clientId,
      data.selector,
      data.verifierHash,
      data.redirectUri,
      data.codeChallenge,
      data.requestedAudience ?? null,
      data.requestedFreshnessSeconds ?? null,
      data.authenticationTime ?? null,
      data.expiresAt,
      data.createdAt,
    );
  }

  static parse(rawCode: string): { selector: string; verifier: string } | null {
    const parts = rawCode.split(':');
    if (parts.length !== 2) return null;
    const [selector, verifier] = parts;
    if (
      !selector ||
      !verifier ||
      selector.length !== 32 ||
      verifier.length !== 64 ||
      !CODE_PART_PATTERN.test(selector) ||
      !CODE_PART_PATTERN.test(verifier)
    ) {
      return null;
    }
    return { selector, verifier };
  }

  matchesCodeVerifierHash(verifier: string): boolean {
    return constantTimeEqual(hashVerifier(verifier), this.verifierHash);
  }

  matchesPkceVerifier(codeVerifier: string): boolean {
    if (!PKCE_VERIFIER_PATTERN.test(codeVerifier)) return false;
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
    return constantTimeEqual(challenge, this.codeChallenge);
  }

  isExpired(now = new Date()): boolean {
    return this.expiresAt <= now;
  }
}
