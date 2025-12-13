import { uuidv7 } from 'uuidv7';
import { constantTimeEqual, generateSplitToken, hashVerifier, parseSplitToken } from '../../security/tokens.js';

export class PasswordResetToken {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly selector: string,
    public readonly verifierHash: string,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
  ) {}

  static create(userId: string, ttlMs: number): { token: PasswordResetToken; rawToken: string } {
    const { selector, verifier, verifierHash, token } = generateSplitToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const record = new PasswordResetToken(uuidv7(), userId, selector, verifierHash, expiresAt, now);

    return { token: record, rawToken: token };
  }

  static rehydrate(data: {
    id: string;
    userId: string;
    selector: string;
    verifierHash: string;
    expiresAt: Date;
    createdAt: Date;
  }): PasswordResetToken {
    return new PasswordResetToken(
      data.id,
      data.userId,
      data.selector,
      data.verifierHash,
      data.expiresAt,
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
