# @fortressauth/electron-sdk

Electron compatibility wrapper for `@fortressauth/desktop-sdk`.

The old `electron-store` default was removed because an application-shipped fixed encryption key does not provide secret storage. Supply a `SecureAuthStorage` implementation backed by Electron `safeStorage` plus persisted ciphertext, or an OS-keychain library. Create the client in the main or utility process after `app.whenReady()`, inject Electron's native `net.fetch` transport, and supply an `openExternal` function using `shell.openExternal`.

```ts
import { app, net, shell } from 'electron';
import { FortressAuth } from '@fortressauth/electron-sdk';

await app.whenReady();
const auth = new FortressAuth({
  baseUrl: 'https://auth.example.com',
  clientId: 'my-electron-app',
  redirectUri: 'my-app://auth/callback',
  storage: keychainStorage,
  openExternal: (url) => shell.openExternal(url),
  fetch: net.fetch as typeof globalThis.fetch,
});
```

Keep credentials and transport access out of the renderer and expose narrow auth operations over IPC when required. See `@fortressauth/desktop-sdk` for the framework-neutral transport, native authorization, and callback contracts.

## Migrating from 0.1

Version 0.2 intentionally replaces renderer-style email/password calls with the secure native
OAuth contract. `clientId`, `redirectUri`, `storage`, and `openExternal` are now required;
`signIn(email, password)`, `signUp`, `signInWithOAuth`, password-reset helpers,
`createElectronStorage`, and `getDefaultStorage` were removed. Use `signIn(provider)`, pass the deep
link to `handleAuthorizationCallback`, and call `restoreSession` after startup. Existing
`electron-store` credentials are not migrated; users must authenticate again into OS-backed secure
storage. Keep the wrapper in Electron's main/utility process and expose only narrow IPC operations.
