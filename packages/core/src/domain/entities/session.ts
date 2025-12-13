import { uuidv7 } from 'uuidv7';
import { constantTimeEqual, generateSplitToken, hashVerifier, parseSplitToken } from '../../security/tokens.js';

export class Session {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly selector: string,
    public readonly verifierHash: string,
    public readonly expiresAt: Date,
    public readonly ipAddress: string | null,
    public readonly userAgent: string | null,
    public readonly createdAt: Date,
  ) {}

  static create(
    userId: string,
    ttlMs: number,
    ipAddress?: string,
    userAgent?: string,
  ): { session: Session; rawToken: string } {
    const { selector, verifierHash, token } = generateSplitToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const session = new Session(
      uuidv7(),
      userId,
      selector,
      verifierHash,
      expiresAt,
      ipAddress ?? null,
      userAgent ?? null,
      now,
    );

    return { session, rawToken: token };
  }

  static hashToken(verifier: string): string {
    return hashVerifier(verifier);
  }

  static rehydrate(data: {
    id: string;
    userId: string;
    selector: string;
    verifierHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  }): Session {
    return new Session(
      data.id,
      data.userId,
      data.selector,
      data.verifierHash,
      data.expiresAt,
      data.ipAddress,
      data.userAgent,
      data.createdAt,
    );
  }

  static parse(rawToken: string): { selector: string; verifier: string } | null {
    return parseSplitToken(rawToken);
  }

  matchesVerifier(verifier: string): boolean {
    const candidateHash = hashVerifier(verifier);
    return constantTimeEqual(candidateHash, this.verifierHash);
  }

  isExpired(): boolean {
    return this.expiresAt <= new Date();
  }
}