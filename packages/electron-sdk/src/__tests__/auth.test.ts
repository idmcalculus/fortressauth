import { createMemoryStorage } from '@fortressauth/desktop-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createAuth, FortressAuth } from '../auth.js';

describe('Electron compatibility wrapper', () => {
  it('requires the framework-neutral secure-storage and external-browser contract', () => {
    const auth = createAuth({
      baseUrl: 'https://auth.example.com',
      clientId: 'electron-app',
      redirectUri: 'my-app://auth/callback',
      storage: createMemoryStorage(),
      openExternal: vi.fn(),
    });
    expect(auth).toBeInstanceOf(FortressAuth);
  });
});
