import { act, renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthProvider.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock storage module
const storageData = new Map<string, string>();
const mockStorage = {
  getItem: vi.fn(async (key: string) => storageData.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    storageData.set(key, value);
  }),
  removeItem: vi.fn(async (key: string) => {
    storageData.delete(key);
  }),
};

vi.mock('../storage.js', () => ({
  getExpoStorage: () => mockStorage,
  createSecureStorage: () => mockStorage,
}));

function createWrapper(baseUrl?: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <AuthProvider {...(baseUrl ? { baseUrl } : {})}>{children}</AuthProvider>;
  };
}

describe('AuthProvider (Expo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    storageData.clear();

    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/me')) {
        return {
          json: () => Promise.resolve({ success: false, error: 'No session' }),
        };
      }
      return {
        json: () => Promise.resolve({ success: true, data: {} }),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use expo storage', async () => {
    storageData.set('fortress_auth_token', 'expo-token');
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/me')) {
        return {
          json: () =>
            Promise.resolve({
              success: true,
              data: { user: { id: '1', email: 'expo@example.com' } },
            }),
        };
      }
      return { json: () => Promise.resolve({ success: false }) };
    });

    renderHook(() => useAuth(), { wrapper: createWrapper('http://localhost:3000') });

    await waitFor(() => {
      expect(mockStorage.getItem).toHaveBeenCalledWith('fortress_auth_token');
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer expo-token',
          }),
        }),
      );
    });
  });

  it('should sign up and store token in storage', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/signup')) {
        return {
          json: () =>
            Promise.resolve({
              success: true,
              data: { user: { id: '2', email: 'new@expo.com' }, token: 'new-expo-token' },
            }),
        };
      }
      if (url.endsWith('/auth/me')) {
        return {
          json: () =>
            Promise.resolve({
              success: true,
              data: { user: { id: '2', email: 'new@expo.com' } },
            }),
        };
      }
      return { json: () => Promise.resolve({ success: false }) };
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signUp('new@expo.com', 'password123');
    });

    expect(mockStorage.setItem).toHaveBeenCalledWith('fortress_auth_token', 'new-expo-token');

    await waitFor(() => {
      expect(result.current.user?.email).toBe('new@expo.com');
    });
  });
});
