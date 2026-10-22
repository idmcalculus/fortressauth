import {
  DesktopAuthClient,
  type DesktopAuthConfig,
  type SecureAuthStorage,
} from '@fortressauth/desktop-sdk';

/**
 * Electron compatibility wrapper around the framework-neutral desktop SDK.
 * The application must inject OS-keychain-backed storage and an external-browser opener.
 */
export class FortressAuth extends DesktopAuthClient {}

export function createAuth(config: DesktopAuthConfig): FortressAuth {
  return new FortressAuth(config);
}

export type { DesktopAuthConfig, SecureAuthStorage };
