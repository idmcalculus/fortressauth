import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FortressAuth, createAuth } from '../auth.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock storage module
const mockStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

vi.mock('../storage.js', () => ({
  getDefaultStorage: () => mockStorage,
  createElectronStorage: () => mockStorage,
  inMemoryStorage: {},
}));

const waitForInit = () => new Promise((resolve) => setTimeout(resolve, 0));

const mockFetchResponse = (payload: unknown) => {
  mockFetch.mockResolvedValueOnce({
    json: () => Promise.resolve(payload),
  });
};

const setupAuth = async (config?: ConstructorParameters<typeof FortressAuth>[0]) => {
  const auth = new FortressAuth(config);
  await waitForInit();
  return auth;
};

describe('FortressAuth (Electron)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockStorage.getItem.mockResolvedValue(null);
    mockStorage.setItem.mockResolvedValue(undefined);
    mockStorage.removeItem.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should check storage for token on init', async () => {
      mockStorage.getItem.mockResolvedValue('stored-token');
      mockFetchResponse({
        success: true,
        data: { user: { id: '1', email: 'test@example.com' } },
      });

      const auth = new FortressAuth();
      // Wait for async init
      await waitForInit();

      expect(mockStorage.getItem).toHaveBeenCalledWith('auth_token');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer stored-token',
          }),
        }),
      );
      expect(auth.user?.email).toBe('test@example.com');
    });

    it('should set error when refreshUser fails', async () => {
      mockStorage.getItem.mockResolvedValue('stored-token');
      mockFetchResponse({
        success: false,
        error: 'Token expired',
      });

      const auth = new FortressAuth();
      await waitForInit();

      expect(auth.user).toBeNull();
      expect(auth.error).toBe('Token expired');
      expect(auth.loading).toBe(false);
    });
  });

  describe('signUp', () => {
    it('should sign up and store token', async () => {
      const auth = await setupAuth();
      mockFetchResponse({
        success: true,
        data: { user: { id: '2', email: 'new@example.com' }, token: 'new-token' },
      });

      const result = await auth.signUp('new@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith('auth_token', 'new-token');
      expect(auth.user?.email).toBe('new@example.com');
    });

    it('should handle signup without token', async () => {
      const auth = await setupAuth();
      mockFetchResponse({
        success: true,
        data: { user: { id: '2', email: 'new@example.com' } },
      });

      const result = await auth.signUp('new@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(mockStorage.setItem).not.toHaveBeenCalled();
      expect(auth.user?.email).toBe('new@example.com');
    });

    it('should set error when signup fails', async () => {
      const auth = await setupAuth();
      mockFetchResponse({ success: false });

      const result = await auth.signUp('new@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(auth.error).toBe('UNKNOWN_ERROR');
    });
  });

  describe('signIn', () => {
    it('should sign in and store token', async () => {
      const auth = await setupAuth();
      mockFetchResponse({
        success: true,
        data: { user: { id: '1', email: 'test@example.com' }, token: 'login-token' },
      });

      const result = await auth.signIn('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith('auth_token', 'login-token');
      expect(auth.user?.email).toBe('test@example.com');
    });

    it('should set error when signin fails', async () => {
      const auth = await setupAuth();
      mockFetchResponse({ success: false, error: 'Invalid credentials' });

      const result = await auth.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(auth.error).toBe('Invalid credentials');
    });

    it('should surface network errors from apiRequest', async () => {
      const auth = await setupAuth();
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      const result = await auth.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(auth.error).toBe('Network down');
    });

    it('should default to Network error for non-Error failures', async () => {
      const auth = await setupAuth();
      mockFetch.mockRejectedValueOnce('boom');

      const result = await auth.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(auth.error).toBe('Network error');
    });
  });

  describe('signOut', () => {
    it('should sign out and clear token', async () => {
      mockStorage.getItem.mockResolvedValue('token');
      mockFetchResponse({ success: true });

      const auth = new FortressAuth();
      await waitForInit();

      mockFetchResponse({ success: true });
      await auth.signOut();

      expect(mockStorage.removeItem).toHaveBeenCalledWith('auth_token');
      expect(auth.user).toBeNull();
    });

    it('should keep state when signout fails', async () => {
      const auth = await setupAuth();
      mockFetchResponse({
        success: true,
        data: { user: { id: '1', email: 'test@example.com' }, token: 'token' },
      });
      await auth.signIn('test@example.com', 'password123');

      mockFetchResponse({ success: false, error: 'Server error' });
      await auth.signOut();

      expect(mockStorage.removeItem).not.toHaveBeenCalled();
      expect(auth.user?.email).toBe('test@example.com');
    });
  });

  describe('state accessors', () => {
    it('should expose getters and state snapshot', async () => {
      const auth = await setupAuth();
      const state = auth.getState();

      expect(state.loading).toBe(false);
      expect(auth.user).toBeNull();
      expect(auth.loading).toBe(false);
      expect(auth.error).toBeNull();

      mockFetchResponse({
        success: true,
        data: { user: { id: '1', email: 'test@example.com' }, token: 'token' },
      });
      await auth.signIn('test@example.com', 'password123');

      expect(auth.user?.email).toBe('test@example.com');
      expect(auth.error).toBeNull();
    });
  });

  describe('misc endpoints', () => {
    it('should call verifyEmail', async () => {
      const auth = await setupAuth();
      mockFetchResponse({ success: true, data: { verified: true } });

      const result = await auth.verifyEmail('verify-token');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/verify-email',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'verify-token' }),
        }),
      );
    });

    it('should call requestPasswordReset and resetPassword', async () => {
      const auth = await setupAuth();
      mockFetchResponse({ success: true, data: { requested: true } });
      mockFetchResponse({ success: true, data: { reset: true } });

      const requestResult = await auth.requestPasswordReset('test@example.com');
      const resetResult = await auth.resetPassword('reset-token', 'new-password');

      expect(requestResult.success).toBe(true);
      expect(resetResult.success).toBe(true);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'http://localhost:3000/auth/request-password-reset',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com' }),
        }),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'http://localhost:3000/auth/reset-password',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'reset-token', newPassword: 'new-password' }),
        }),
      );
    });
  });

  describe('subscribe', () => {
    it('should notify listeners of state changes', async () => {
      const auth = await setupAuth();
      const listener = vi.fn();
      const unsubscribe = auth.subscribe(listener);

      // Initial call
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ loading: false }));

      mockFetchResponse({
        success: true,
        data: { user: { id: '1', email: 'test@example.com' }, token: 'token' },
      });

      await auth.signIn('test@example.com', 'password123');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ email: 'test@example.com' }),
        }),
      );

      const callsAfterSignIn = listener.mock.calls.length;
      unsubscribe();

      mockFetchResponse({ success: false, error: 'Invalid credentials' });
      await auth.signIn('test@example.com', 'password123');

      expect(listener).toHaveBeenCalledTimes(callsAfterSignIn);
    });
  });

  describe('createAuth', () => {
    it('should create a FortressAuth instance', async () => {
      const auth = createAuth({ baseUrl: 'https://example.com' });
      await waitForInit();
      expect(auth).toBeInstanceOf(FortressAuth);

      mockFetchResponse({
        success: true,
        data: { user: { id: '1', email: 'test@example.com' }, token: 'token' },
      });
      await auth.signIn('test@example.com', 'password123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/auth/login',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });
});
