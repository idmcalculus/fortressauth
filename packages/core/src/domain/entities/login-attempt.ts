import { uuidv7 } from 'uuidv7';

export class LoginAttempt {
  private constructor(
    public readonly id: string,
    public readonly userId: string | null,
    public readonly email: string,
    public readonly ipAddress: string,
    public readonly success: boolean,
    public readonly createdAt: Date,
  ) {}

  static create(email: string, ipAddress: string, success: boolean, userId?: string): LoginAttempt {
    return new LoginAttempt(
      uuidv7(),
      userId ?? null,
      email.toLowerCase(),
      ipAddress,
      success,
      new Date(),
    );
  }

  static rehydrate(data: {
    id: string;
    userId: string | null;
    email: string;
    ipAddress: string;
    success: boolean;
    createdAt: Date;
  }): LoginAttempt {
    return new LoginAttempt(
      data.id,
      data.userId,
      data.email,
      data.ipAddress,
      data.success,
      data.createdAt,
    );
  }
}
