import { uuidv7 } from 'uuidv7';
import {
  constantTimeEqual,
  generateSplitToken,
  hashVerifier,
  parseSplitToken,
} from '../../security/tokens.js';

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
    public readonly nativeClientId: string | null,
    public readonly nativeAudiences: readonly string[] | null,
    public readonly nativeEmail: string | null,
    public readonly nativeEmailVerified: boolean | null,
    public readonly authenticationTime: Date | null,
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
      null,
      null,
      null,
      null,
      null,
    );

    return { session, rawToken: token };
  }

  static createNative(params: {
    userId: string;
    ttlMs: number;
    clientId: string;
    grantedAudiences: readonly string[];
    email: string | null;
    emailVerified: boolean;
    authenticationTime: Date | null;
    ipAddress?: string;
    userAgent?: string;
  }): { session: Session; rawToken: string } {
    const { selector, verifierHash, token } = generateSplitToken();
    const now = new Date();
    const session = new Session(
      uuidv7(),
      params.userId,
      selector,
      verifierHash,
      new Date(now.getTime() + params.ttlMs),
      params.ipAddress ?? null,
      params.userAgent ?? null,
      now,
      params.clientId,
      [...new Set(params.grantedAudiences)],
      params.email,
      params.emailVerified,
      params.authenticationTime,
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
    nativeClientId?: string | null;
    nativeAudiences?: readonly string[] | null;
    nativeEmail?: string | null;
    nativeEmailVerified?: boolean | null;
    authenticationTime?: Date | null;
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
      data.nativeClientId ?? null,
      data.nativeAudiences ? [...data.nativeAudiences] : null,
      data.nativeEmail ?? null,
      data.nativeEmailVerified ?? null,
      data.authenticationTime ?? null,
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

  hasNativeAudience(audience: string): boolean {
    return this.nativeAudiences?.includes(audience) ?? false;
  }
}
