import { uuidv7 } from 'uuidv7';

export type ProviderId =
  | 'email'
  | 'google'
  | 'github'
  | 'apple'
  | 'microsoft'
  | 'twitter'
  | 'discord'
  | 'linkedin';
export type OAuthProviderId = Exclude<ProviderId, 'email'>;

export class Account {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly providerId: ProviderId,
    public readonly providerUserId: string,
    public readonly passwordHash: string | null,
    public readonly createdAt: Date,
  ) {}

  static createEmailAccount(userId: string, email: string, passwordHash: string): Account {
    return new Account(uuidv7(), userId, 'email', email.toLowerCase(), passwordHash, new Date());
  }

  static createOAuthAccount(
    userId: string,
    providerId: OAuthProviderId,
    providerUserId: string,
  ): Account {
    // Type system prevents 'email' from being passed via OAuthProviderId type
    return new Account(uuidv7(), userId, providerId, providerUserId, null, new Date());
  }

  static rehydrate(data: {
    id: string;
    userId: string;
    providerId: ProviderId;
    providerUserId: string;
    passwordHash: string | null;
    createdAt: Date;
  }): Account {
    return new Account(
      data.id,
      data.userId,
      data.providerId,
      data.providerUserId,
      data.passwordHash,
      data.createdAt,
    );
  }
}
