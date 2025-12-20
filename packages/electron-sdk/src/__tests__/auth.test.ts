import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FortressAuth } from '../auth.js';

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
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            data: { user: { id: '1', email: 'test@example.com' } },
          }),
      });

      const auth = new FortressAuth();
      // Wait for async init
      await new Promise((r) => setTimeout(r, 10));

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
  });

  describe('signUp', () => {
    it('should sign up and store token', async () => {
      const auth = new FortressAuth();
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            data: { user: { id: '2', email: 'new@example.com' }, token: 'new-token' },
          }),
      });

      const result = await auth.signUp('new@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith('auth_token', 'new-token');
      expect(auth.user?.email).toBe('new@example.com');
    });
  });

  describe('signIn', () => {
    it('should sign in and store token', async () => {
      const auth = new FortressAuth();
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            data: { user: { id: '1', email: 'test@example.com' }, token: 'login-token' },
          }),
      });

      const result = await auth.signIn('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith('auth_token', 'login-token');
      expect(auth.user?.email).toBe('test@example.com');
    });
  });

  describe('signOut', () => {
    it('should sign out and clear token', async () => {
      mockStorage.getItem.mockResolvedValue('token');
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });

      const auth = new FortressAuth();
      await new Promise((r) => setTimeout(r, 10));

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });
      await auth.signOut();

      expect(mockStorage.removeItem).toHaveBeenCalledWith('auth_token');
      expect(auth.user).toBeNull();
    });
  });

  describe('subscribe', () => {
    it('should notify listeners of state changes', async () => {
      const auth = new FortressAuth();
      const listener = vi.fn();
      auth.subscribe(listener);

      // Initial call
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ loading: true }));

      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            data: { user: { id: '1', email: 'test@example.com' }, token: 'token' },
          }),
      });

      await auth.signIn('test@example.com', 'password123');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ email: 'test@example.com' }),
        }),
      );
    });
  });
});
