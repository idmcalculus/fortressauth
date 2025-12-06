import { createHash, randomBytes } from 'node:crypto';
import { uuidv7 } from 'uuidv7';

export class Session {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly tokenHash: string,
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
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = Session.hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const session = new Session(
      uuidv7(),
      userId,
      tokenHash,
      expiresAt,
      ipAddress ?? null,
      userAgent ?? null,
      now,
    );

    return { session, rawToken };
  }

  static hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  static rehydrate(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  }): Session {
    return new Session(
      data.id,
      data.userId,
      data.tokenHash,
      data.expiresAt,
      data.ipAddress,
      data.userAgent,
      data.createdAt,
    );
  }

  isExpired(): boolean {
    return this.expiresAt <= new Date();
  }
}
