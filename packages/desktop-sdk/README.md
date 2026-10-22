# @fortressauth/desktop-sdk

Framework-neutral native desktop authentication for Tauri, Electron, and other desktop runtimes.

The SDK opens the OAuth provider in the system browser, generates PKCE and state values, validates the callback, exchanges a short-lived one-time authorization code, and uses the resulting split session token as an HTTP Bearer credential. Session tokens never appear in redirect URLs.

The current desktop launch contract is **OAuth-only**. A desktop consumer may offer the OAuth providers configured by the FortressAuth server, but it must not collect FortressAuth email/password credentials directly or imply that password signup/signin is supported. Adding those methods requires a separate hosted FortressAuth browser UI with a native authorization-code handoff; it is not part of this SDK release.

Production applications must inject `SecureAuthStorage` backed by the operating-system keychain. There is no default persistent storage and no embedded encryption key. `createMemoryStorage()` exists only for tests and development.

Storage keys are isolated per normalized `baseUrl` and `clientId`. Set `storageNamespace` only when
the application needs an explicit stable namespace; it must still be unique for each server/client
pair. Credentials written by the pre-release global-key implementation are not auto-migrated,
because assigning an unbound token to one of several clients would be unsafe. Users sign in again
after that upgrade.

```ts
import { DesktopAuthClient } from '@fortressauth/desktop-sdk';

const auth = new DesktopAuthClient({
  baseUrl: 'https://auth.example.com',
  clientId: 'my-desktop-app',
  redirectUri: 'my-app://auth/callback',
  storage: keychainStorage,
  openExternal: (url) => openWithTauriShell(url),
  fetch: nativeFetch,
});

await auth.signIn('google', { audience: 'account-api' });
// In the registered deep-link handler:
await auth.handleAuthorizationCallback(callbackUrl);
```

Register the redirect URI exactly on the server. The callback handler must receive the full URI and should be invoked only from the application’s OS deep-link or loopback listener. Never log callback URLs, authorization codes, PKCE verifiers, or session tokens.

The client validates callback state before handling either success or a structured OAuth error. Provider-supplied descriptions are not exposed. Requests have a bounded ten-second timeout by default (`requestTimeoutMs` can be set from 100ms to 60s). Network, timeout, malformed-response, and 5xx failures preserve the keychain credential or pending authorization so the app can retry when connectivity returns. HTTP 401, `SESSION_INVALID`, `SESSION_EXPIRED`, or a locally expired credential clear it.

Native sessions carry an explicit `expiresAt`, which is persisted with the split token and exposed through `DesktopAuthState`. There is no silent refresh-token lifecycle: expiry, server-side revocation, or logout requires a new system-browser authorization. The server default is 24 hours and can be shortened with `NATIVE_SESSION_TTL_MS`.

## Audience binding and step-up

Pass a registered `audience` when the session needs one resource server. The audience is bound into
server-stored authorization state, the one-time code, and the new session; adding an audience to
server configuration later does not upgrade an old session.

```ts
await auth.signIn('google', {
  audience: 'account-api',
  maxAgeSeconds: 300,
});
```

`maxAgeSeconds` requests a provider-proven fresh ceremony. Providers that cannot prove freshness
fail closed with a typed error; ordinary SSO completion is not labeled fresh. Resource servers use
the introspection response's `auth_time` for sensitive-operation policy and must reject null, future,
or stale values. Token exchange, restore, and introspection never manufacture authentication time.

## Packaged-desktop HTTP transport

`DesktopAuthConfig.fetch` accepts any Fetch-compatible implementation and is used for token exchange, session restore, and logout. Production packaged applications should inject a native HTTP transport when a WebView or renderer `globalThis.fetch` would be subject to browser CORS. CORS only controls browser access; it is not the native-client authorization boundary. Native client authorization remains the exact `clientId` and redirect URI registry, PKCE, state binding, one-time grant consumption, and bearer-session validation.

If `fetch` is omitted, the SDK uses `globalThis.fetch`. This is a supported fallback for development and for runtimes where global fetch is already compatible with the deployment. Do not broaden the server's default CORS allowlist with generic Tauri origins or app-specific values to make a packaged client work.

### Tauri 2

`DesktopAuthClient` is TypeScript: whichever JavaScript process instantiates it can observe the
bearer token in memory. Using `@tauri-apps/plugin-http` avoids WebView CORS, but it does **not** keep
the token out of the WebView JavaScript process. Use this integration only when that matches the
application's documented threat model.

Install and initialize `@tauri-apps/plugin-http` (for example, `pnpm tauri add http`), then scope its capability to only the FortressAuth API host. For example, a capability entry for `https://auth.example.com` is:

```json
{
  "permissions": [
    {
      "identifier": "http:default",
      "allow": [{ "url": "https://auth.example.com/**" }]
    }
  ]
}
```

Inject the plugin's Rust-backed fetch implementation:

```ts
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { DesktopAuthClient } from '@fortressauth/desktop-sdk';

const auth = new DesktopAuthClient({
  baseUrl: 'https://auth.example.com',
  clientId: 'my-tauri-app',
  redirectUri: 'my-app://auth/callback',
  storage: keychainStorage,
  openExternal,
  fetch: tauriFetch as typeof globalThis.fetch,
});
```

Keep the capability host-specific; do not grant wildcard network access.

If the security contract requires Rust-owned credentials, do not instantiate `DesktopAuthClient`
in the WebView. Implement the same system-browser, state, PKCE, callback, exchange, restore, and
logout contract in a Rust controller (or a separately trusted sidecar). Expose narrow commands and
redacted auth state to the renderer; never return the session token, PKCE verifier, or callback URL
over IPC.

### Electron

Create the client in Electron's main or utility process after `app.whenReady()` and inject `net.fetch`, which uses Chromium's native network stack. Keep tokens and keychain operations out of the renderer; expose only narrow auth actions/state over IPC if the UI needs them.

```ts
import { app, net, shell } from 'electron';
import { DesktopAuthClient } from '@fortressauth/desktop-sdk';

await app.whenReady();
const auth = new DesktopAuthClient({
  baseUrl: 'https://auth.example.com',
  clientId: 'my-electron-app',
  redirectUri: 'my-app://auth/callback',
  storage: keychainStorage,
  openExternal: (url) => shell.openExternal(url),
  fetch: net.fetch as typeof globalThis.fetch,
});
```

### Other desktop runtimes

Wrap the runtime's native HTTP client behind the same `(input, init) => Promise<Response>` contract and pass it as `fetch`. The adapter must preserve HTTP status, headers, JSON response bodies, request headers, request bodies, and `AbortSignal` cancellation. Restrict native network permissions to the FortressAuth API host wherever the runtime provides a capability or entitlement system.

## Consumer handoff: Wraith

Wraith remains an operator/consumer integration, not a built-in SDK assumption. Its stated boundary
requires the opaque session to remain Rust-owned, so Wraith must use the Rust-controller pattern
above—not a renderer-instantiated `DesktopAuthClient` or renderer-callable HTTP plugin. The renderer
may request sign-in/sign-out and receive redacted user/session state only. That implementation and
its packaged-app smoke tests belong in the Wraith repository.
