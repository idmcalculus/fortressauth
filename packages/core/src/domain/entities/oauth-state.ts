import { uuidv7 } from 'uuidv7';
import type { OAuthProviderId } from './account.js';

export class OAuthState {
  private constructor(
    public readonly id: string,
    public readonly providerId: OAuthProviderId,
    public readonly state: string,
    public readonly codeVerifier: string | null,
    public readonly redirectUri: string | null,
    public readonly nativeClientId: string | null,
    public readonly nativeRedirectUri: string | null,
    public readonly nativeCodeChallenge: string | null,
    public readonly nativeState: string | null,
    public readonly nativeAudience: string | null,
    public readonly nativeMaxAgeSeconds: number | null,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
  ) {}

  static create(params: {
    providerId: OAuthProviderId;
    state: string;
    codeVerifier?: string;
    redirectUri?: string;
    nativeClientId?: string;
    nativeRedirectUri?: string;
    nativeCodeChallenge?: string;
    nativeState?: string;
    nativeAudience?: string;
    nativeMaxAgeSeconds?: number;
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
      params.nativeClientId ?? null,
      params.nativeRedirectUri ?? null,
      params.nativeCodeChallenge ?? null,
      params.nativeState ?? null,
      params.nativeAudience ?? null,
      params.nativeMaxAgeSeconds ?? null,
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
    nativeClientId: string | null;
    nativeRedirectUri: string | null;
    nativeCodeChallenge: string | null;
    nativeState: string | null;
    nativeAudience?: string | null;
    nativeMaxAgeSeconds?: number | null;
    expiresAt: Date;
    createdAt: Date;
  }): OAuthState {
    return new OAuthState(
      data.id,
      data.providerId,
      data.state,
      data.codeVerifier,
      data.redirectUri,
      data.nativeClientId,
      data.nativeRedirectUri,
      data.nativeCodeChallenge,
      data.nativeState,
      data.nativeAudience ?? null,
      data.nativeMaxAgeSeconds ?? null,
      data.expiresAt,
      data.createdAt,
    );
  }

  isExpired(): boolean {
    return this.expiresAt.getTime() <= Date.now();
  }
}
