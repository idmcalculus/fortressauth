import type {
  ApiResponse,
  AuthorizationRequest,
  DesktopAuthConfig,
  DesktopAuthError,
  DesktopAuthState,
  NativeAuthorizationOptions,
  NativeOAuthProvider,
  SecureAuthStorage,
  User,
} from './types.js';

const STORAGE_PREFIX = 'fortress.native';
const PKCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

type PendingAuthorization = { state: string; codeVerifier: string };
type StoredSession = { token: string; expiresAt: string | null };
type Listener = (state: DesktopAuthState) => void;
type JsonResult =
  | { ok: true; response: Response; body: ApiResponse }
  | { ok: false; error: DesktopAuthError; response?: Response };

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const AUTH_FAILURE_CODES = new Set(['SESSION_INVALID', 'SESSION_EXPIRED']);
const AUTHORIZATION_FAILURE_CODES = new Set(['NATIVE_AUTHORIZATION_INVALID']);

function protocolError(): DesktopAuthError {
  return {
    code: 'PROTOCOL_ERROR',
    message: 'The authentication server returned an invalid response.',
  };
}

function storageError(): DesktopAuthError {
  return { code: 'STORAGE_ERROR', message: 'Secure storage failed.' };
}

function stableNamespace(value: string): string {
  // Two independent FNV-1a passes keep storage keys compact while providing
  // deterministic isolation across server/client pairs. This is namespacing,
  // not a cryptographic trust decision.
  const hash = (seed: number) => {
    let result = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 0x01000193);
    }
    return result >>> 0;
  };
  return `${hash(0x811c9dc5).toString(16).padStart(8, '0')}${hash(0x9e3779b9)
    .toString(16)
    .padStart(8, '0')}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isEmail(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isUuid(record.id) &&
    isEmail(record.email) &&
    typeof record.emailVerified === 'boolean' &&
    isIsoTimestamp(record.createdAt)
  );
}

function isTokenExchangeData(
  value: unknown,
): value is { token: string; tokenType: 'Bearer'; expiresAt: string; user: User } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isNonEmptyString(record.token) &&
    record.tokenType === 'Bearer' &&
    isIsoTimestamp(record.expiresAt) &&
    Date.parse(record.expiresAt) > Date.now() &&
    isUser(record.user)
  );
}

function isSessionData(value: unknown): value is { user: User } {
  return (
    typeof value === 'object' && value !== null && isUser((value as Record<string, unknown>).user)
  );
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(crypto: Crypto, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (const byte of bytes) result += PKCE_ALPHABET[byte % PKCE_ALPHABET.length];
  return result;
}

function sameSecret(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function structuredError(
  error: ApiResponse['error'] | undefined,
  fallbackCode = 'AUTH_REQUEST_FAILED',
  fallbackMessage = 'The authentication request failed.',
): DesktopAuthError {
  if (typeof error === 'string') return { code: error, message: fallbackMessage };
  return {
    code: error?.code ?? fallbackCode,
    message: error?.message ?? fallbackMessage,
  };
}

function parsePending(raw: string | null): PendingAuthorization | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).state === 'string' &&
      typeof (value as Record<string, unknown>).codeVerifier === 'string'
    ) {
      return value as PendingAuthorization;
    }
  } catch {
    // Corrupted storage is treated as an invalid local authorization attempt.
  }
  return null;
}

function parseSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  // Backward compatibility for credentials written by desktop-sdk <= 0.1.14.
  if (!raw.startsWith('{')) return { token: raw, expiresAt: null };
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof value.token === 'string' &&
      value.token.length > 0 &&
      (value.expiresAt === null || typeof value.expiresAt === 'string')
    ) {
      return { token: value.token, expiresAt: value.expiresAt };
    }
  } catch {
    // Invalid structured credentials are not usable.
  }
  return null;
}

function callbackError(code: string | null, _description: string | null): DesktopAuthError {
  const safeCode = code?.match(/^[A-Z][A-Z0-9_]{0,63}$/)?.[0] ?? 'OAUTH_AUTH_FAILED';
  const messageByCode: Record<string, string> = {
    AUTHORIZATION_CALLBACK_INVALID: 'The authorization callback was invalid.',
    STEP_UP_UNSUPPORTED: 'The selected provider cannot prove a fresh authentication ceremony.',
    STEP_UP_FAILED: 'Fresh authentication could not be verified.',
    NATIVE_AUDIENCE_INVALID: 'The requested resource audience is not registered for this client.',
  };
  return {
    code: safeCode,
    message: messageByCode[safeCode] ?? 'Authorization was cancelled or denied.',
  };
}

/** Explicitly test/development-only storage. Production apps must inject an OS-keychain adapter. */
export function createMemoryStorage(): SecureAuthStorage {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

export class DesktopAuthClient {
  private readonly fetcher: typeof fetch;
  private readonly webCrypto: Crypto;
  private readonly listeners = new Set<Listener>();
  private state: DesktopAuthState = {
    user: null,
    loading: false,
    error: null,
    expiresAt: null,
  };
  private readonly requestTimeoutMs: number;
  private readonly baseUrl: URL;
  private readonly basePath: string;
  private readonly sessionKey: string;
  private readonly pendingKey: string;

  constructor(private readonly config: DesktopAuthConfig) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.webCrypto = config.crypto ?? globalThis.crypto;
    this.requestTimeoutMs = Math.min(
      60_000,
      Math.max(100, config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
    );
    if (!this.fetcher || !this.webCrypto) {
      throw new Error('DesktopAuthClient requires Fetch and Web Crypto implementations');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(config.clientId)) {
      throw new Error('DesktopAuthClient requires a valid client ID');
    }
    const baseUrl = new URL(config.baseUrl);
    if (
      !['http:', 'https:'].includes(baseUrl.protocol) ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.search ||
      baseUrl.hash ||
      config.baseUrl.length > 2_048
    ) {
      throw new Error('DesktopAuthClient requires a bounded HTTP(S) base URL without credentials');
    }
    this.basePath = baseUrl.pathname.replace(/\/+$/, '');
    baseUrl.pathname = this.basePath || '/';
    this.baseUrl = baseUrl;
    if (
      config.storageNamespace !== undefined &&
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(config.storageNamespace)
    ) {
      throw new Error('DesktopAuthClient storageNamespace is invalid');
    }
    const namespace =
      config.storageNamespace ?? stableNamespace(`${baseUrl.toString()}\0${config.clientId}`);
    this.sessionKey = `${STORAGE_PREFIX}.${namespace}.session`;
    this.pendingKey = `${STORAGE_PREFIX}.${namespace}.pending`;

    const redirectUri = new URL(config.redirectUri);
    if (config.redirectUri.length > 2_048 || redirectUri.hash) {
      throw new Error('DesktopAuthClient requires a bounded redirect URI without a fragment');
    }
  }

  private endpoint(path: `/auth/${string}`): string {
    const url = new URL(this.baseUrl.origin);
    url.pathname = `${this.basePath}${path}`;
    return url.toString();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): DesktopAuthState {
    return { ...this.state };
  }

  private update(partial: Partial<DesktopAuthState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.getState());
  }

  private async request(url: string, init: RequestInit = {}): Promise<JsonResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetcher(url, { ...init, signal: controller.signal });
      let body: ApiResponse;
      try {
        body = (await response.json()) as ApiResponse;
      } catch {
        return {
          ok: false,
          response,
          error: protocolError(),
        };
      }
      if (!body || typeof body !== 'object' || typeof body.success !== 'boolean') {
        return {
          ok: false,
          response,
          error: protocolError(),
        };
      }
      return { ok: true, response, body };
    } catch {
      const timedOut = controller.signal.aborted;
      return {
        ok: false,
        error: {
          code: timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
          message: timedOut
            ? 'The authentication request timed out.'
            : 'The authentication server is unavailable.',
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private isDefinitiveAuthFailure(response: Response, body?: ApiResponse): boolean {
    const code = typeof body?.error === 'string' ? body.error : body?.error?.code;
    return response.status === 401 || (code !== undefined && AUTH_FAILURE_CODES.has(code));
  }

  private isDefinitiveAuthorizationFailure(response: Response, body?: ApiResponse): boolean {
    const code = typeof body?.error === 'string' ? body.error : body?.error?.code;
    return response.status === 401 || (code !== undefined && AUTHORIZATION_FAILURE_CODES.has(code));
  }

  private async bestEffortRevoke(token: string): Promise<void> {
    await this.request(this.endpoint('/auth/native/logout'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }

  async createAuthorizationRequest(
    provider: NativeOAuthProvider,
    options: NativeAuthorizationOptions = {},
  ): Promise<AuthorizationRequest> {
    if (
      options.audience !== undefined &&
      (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(options.audience) || options.audience.length > 256)
    ) {
      throw new Error('Invalid native resource audience');
    }
    if (
      options.maxAgeSeconds !== undefined &&
      (!Number.isInteger(options.maxAgeSeconds) ||
        options.maxAgeSeconds < 1 ||
        options.maxAgeSeconds > 24 * 60 * 60)
    ) {
      throw new Error('Invalid native authentication age');
    }
    const state = randomString(this.webCrypto, 64);
    const codeVerifier = randomString(this.webCrypto, 64);
    const digest = await this.webCrypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(codeVerifier),
    );
    const codeChallenge = encodeBase64Url(new Uint8Array(digest));
    await this.config.storage.setItem(this.pendingKey, JSON.stringify({ state, codeVerifier }));

    const url = new URL(this.endpoint(`/auth/native/authorize/${provider}`));
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (options.audience) url.searchParams.set('audience', options.audience);
    if (options.maxAgeSeconds !== undefined) {
      url.searchParams.set('max_age', String(options.maxAgeSeconds));
    }
    return { authorizationUrl: url.toString(), state };
  }

  async signIn(
    provider: NativeOAuthProvider,
    options: NativeAuthorizationOptions = {},
  ): Promise<AuthorizationRequest> {
    const request = await this.createAuthorizationRequest(provider, options);
    await this.config.openExternal(request.authorizationUrl);
    return request;
  }

  async handleAuthorizationCallback(callbackUrl: string): Promise<ApiResponse<{ user: User }>> {
    let callback: URL;
    try {
      callback = new URL(callbackUrl);
    } catch {
      return { success: false, error: callbackError('AUTHORIZATION_CALLBACK_INVALID', null) };
    }
    const received = callback;
    const comparable = new URL(callback.toString());
    const expected = new URL(this.config.redirectUri);
    for (const key of ['code', 'state', 'error', 'error_description'])
      comparable.searchParams.delete(key);
    if (comparable.toString() !== expected.toString()) {
      return { success: false, error: 'REDIRECT_URI_MISMATCH' };
    }

    let pendingRaw: string | null;
    try {
      pendingRaw = await this.config.storage.getItem(this.pendingKey);
    } catch {
      const error = storageError();
      this.update({ error, loading: false });
      return { success: false, error };
    }
    const pending = parsePending(pendingRaw);
    const code = received.searchParams.get('code');
    const state = received.searchParams.get('state');
    if (!pending || !state || !sameSecret(state, pending.state)) {
      try {
        await this.config.storage.removeItem(this.pendingKey);
      } catch {
        const error = storageError();
        this.update({ error, loading: false });
        return { success: false, error };
      }
      const error = callbackError('AUTHORIZATION_CALLBACK_INVALID', null);
      this.update({ error, loading: false });
      return { success: false, error };
    }

    const providerError = received.searchParams.get('error');
    if (providerError) {
      try {
        await this.config.storage.removeItem(this.pendingKey);
      } catch {
        const storageFailure = storageError();
        this.update({ error: storageFailure, loading: false });
        return { success: false, error: storageFailure };
      }
      const error = callbackError(providerError, received.searchParams.get('error_description'));
      this.update({ error, loading: false });
      return { success: false, error };
    }
    if (!code) {
      try {
        await this.config.storage.removeItem(this.pendingKey);
      } catch {
        const storageFailure = storageError();
        this.update({ error: storageFailure, loading: false });
        return { success: false, error: storageFailure };
      }
      const error = callbackError('AUTHORIZATION_CALLBACK_INVALID', null);
      this.update({ error, loading: false });
      return { success: false, error };
    }

    this.update({ loading: true, error: null });
    const result = await this.request(this.endpoint('/auth/native/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grantType: 'authorization_code',
        clientId: this.config.clientId,
        code,
        redirectUri: this.config.redirectUri,
        codeVerifier: pending.codeVerifier,
      }),
    });
    if (!result.ok) {
      if (result.response && this.isDefinitiveAuthorizationFailure(result.response)) {
        await this.config.storage.removeItem(this.pendingKey).catch(() => {});
      }
      this.update({ error: result.error, loading: false });
      return { success: false, error: result.error };
    }
    const { response } = result;
    const body = result.body;
    if (!response.ok || !body.success) {
      if (this.isDefinitiveAuthorizationFailure(response, body)) {
        await this.config.storage.removeItem(this.pendingKey).catch(() => {});
      }
      const error = structuredError(body.error);
      this.update({ error, loading: false });
      return { success: false, error };
    }
    if (!isTokenExchangeData(body.data)) {
      const error = protocolError();
      this.update({ error, loading: false });
      return { success: false, error };
    }
    try {
      await this.config.storage.setItem(
        this.sessionKey,
        JSON.stringify({ token: body.data.token, expiresAt: body.data.expiresAt }),
      );
    } catch {
      await this.bestEffortRevoke(body.data.token);
      await this.config.storage.removeItem(this.pendingKey).catch(() => {});
      const error = storageError();
      this.update({ error, loading: false });
      return { success: false, error };
    }
    await this.config.storage.removeItem(this.pendingKey).catch(() => {});
    this.update({
      user: body.data.user,
      expiresAt: body.data.expiresAt,
      error: null,
      loading: false,
    });
    return { success: true, data: { user: body.data.user } };
  }

  async restoreSession(): Promise<ApiResponse<{ user: User }>> {
    this.update({ loading: true });
    try {
      const raw = await this.config.storage.getItem(this.sessionKey);
      const credential = parseSession(raw);
      if (!credential) {
        if (raw) await this.config.storage.removeItem(this.sessionKey);
        const error = structuredError('SESSION_INVALID');
        this.update({ user: null, loading: false, error: raw ? error : null, expiresAt: null });
        return { success: false, error };
      }
      if (
        credential.expiresAt &&
        (!Number.isFinite(Date.parse(credential.expiresAt)) ||
          Date.parse(credential.expiresAt) <= Date.now())
      ) {
        await this.config.storage.removeItem(this.sessionKey);
        const error = structuredError('SESSION_EXPIRED');
        this.update({ user: null, loading: false, error, expiresAt: null });
        return { success: false, error };
      }
      const result = await this.request(this.endpoint('/auth/native/session'), {
        headers: { Authorization: `Bearer ${credential.token}` },
      });
      if (!result.ok) {
        if (result.response && this.isDefinitiveAuthFailure(result.response)) {
          await this.config.storage.removeItem(this.sessionKey);
          this.update({ user: null, expiresAt: null });
        }
        this.update({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }
      const body = result.body;
      if (!result.response.ok || !body.success) {
        const definitive = this.isDefinitiveAuthFailure(result.response, body);
        if (definitive) await this.config.storage.removeItem(this.sessionKey);
        const error = structuredError(body.error);
        this.update({
          ...(definitive ? { user: null, expiresAt: null } : {}),
          loading: false,
          error,
        });
        return { success: false, error };
      }
      if (!isSessionData(body.data)) {
        const error = protocolError();
        this.update({ loading: false, error });
        return { success: false, error };
      }
      this.update({
        user: body.data.user,
        expiresAt: credential.expiresAt,
        loading: false,
        error: null,
      });
      return { success: true, data: body.data };
    } catch {
      const error = structuredError('STORAGE_ERROR', 'STORAGE_ERROR', 'Secure storage failed.');
      this.update({ loading: false, error });
      return { success: false, error };
    }
  }

  async signOut(): Promise<ApiResponse> {
    this.update({ loading: true, error: null });
    try {
      const raw = await this.config.storage.getItem(this.sessionKey);
      const credential = parseSession(raw);
      if (!credential) {
        if (raw) await this.config.storage.removeItem(this.sessionKey);
        this.update({ user: null, expiresAt: null, error: null, loading: false });
        return { success: true };
      }
      const result = await this.request(this.endpoint('/auth/native/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${credential.token}` },
      });
      if (!result.ok) {
        if (result.response && this.isDefinitiveAuthFailure(result.response)) {
          await this.config.storage.removeItem(this.sessionKey);
          this.update({ user: null, expiresAt: null });
        }
        this.update({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }
      if (result.response.ok && result.body.success) {
        await this.config.storage.removeItem(this.sessionKey);
        this.update({ user: null, expiresAt: null, error: null, loading: false });
        return result.body;
      }
      const definitive = this.isDefinitiveAuthFailure(result.response, result.body);
      if (definitive) await this.config.storage.removeItem(this.sessionKey);
      const error = structuredError(result.body.error);
      this.update({
        ...(definitive ? { user: null, expiresAt: null } : {}),
        loading: false,
        error,
      });
      return { success: false, error };
    } catch {
      const error = structuredError('STORAGE_ERROR', 'STORAGE_ERROR', 'Secure storage failed.');
      this.update({ loading: false, error });
      return { success: false, error };
    }
  }
}
