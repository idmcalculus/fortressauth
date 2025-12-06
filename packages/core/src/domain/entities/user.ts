import { uuidv7 } from 'uuidv7';

export class User {
  private constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly emailVerified: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly lockedUntil: Date | null,
  ) {}

  static create(email: string): User {
    const now = new Date();
    return new User(uuidv7(), email.toLowerCase(), false, now, now, null);
  }

  static rehydrate(data: {
    id: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
    lockedUntil: Date | null;
  }): User {
    return new User(
      data.id,
      data.email,
      data.emailVerified,
      data.createdAt,
      data.updatedAt,
      data.lockedUntil,
    );
  }

  isLocked(): boolean {
    if (!this.lockedUntil) {
      return false;
    }
    return this.lockedUntil > new Date();
  }

  withEmailVerified(): User {
    return new User(this.id, this.email, true, this.createdAt, new Date(), this.lockedUntil);
  }

  withLock(lockedUntil: Date): User {
    return new User(
      this.id,
      this.email,
      this.emailVerified,
      this.createdAt,
      new Date(),
      lockedUntil,
    );
  }

  toJSON(): {
    id: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
    lockedUntil: string | null;
  } {
    return {
      id: this.id,
      email: this.email,
      emailVerified: this.emailVerified,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      lockedUntil: this.lockedUntil?.toISOString() ?? null,
    };
  }
}
