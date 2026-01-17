import { uuidv7 } from 'uuidv7';
import type { OAuthProviderId } from './account.js';

export class OAuthState {
  private constructor(
    public readonly id: string,
    public readonly providerId: OAuthProviderId,
    public readonly state: string,
    public readonly codeVerifier: string | null,
    public readonly redirectUri: string | null,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
  ) {}

  static create(params: {
    providerId: OAuthProviderId;
    state: string;
    codeVerifier?: string;
    redirectUri?: string;
    expiresInMs?: number;
  }): OAuthState {
    const id = uuidv7();
    const createdAt = new Date();
    // Default expiration: 10 minutes
    const expiresAt = new Date(createdAt.getTime() + (params.expiresInMs ?? 10 * 60 * 1000));

    return new OAuthState(
      id,
      params.providerId,
      params.state,
      params.codeVerifier ?? null,
      params.redirectUri ?? null,
      expiresAt,
      createdAt,
    );
  }

  static rehydrate(data: {
    id: string;
    providerId: OAuthProviderId;
    state: string;
    codeVerifier: string | null;
    redirectUri: string | null;
    expiresAt: Date;
    createdAt: Date;
  }): OAuthState {
    return new OAuthState(
      data.id,
      data.providerId,
      data.state,
      data.codeVerifier,
      data.redirectUri,
      data.expiresAt,
      data.createdAt,
    );
  }

  isExpired(): boolean {
    return this.expiresAt.getTime() <= Date.now();
  }
}
