import type { AuthStorage } from './types.js';

// Default in-memory storage (fallback when AsyncStorage not available)
const memoryStorage: Record<string, string> = {};

const inMemoryStorage: AuthStorage = {
  getItem: async (key) => memoryStorage[key] ?? null,
  setItem: async (key, value) => {
    memoryStorage[key] = value;
  },
  removeItem: async (key) => {
    delete memoryStorage[key];
  },
};

/**
 * Creates a storage adapter for @react-native-async-storage/async-storage.
 * Falls back to in-memory storage if AsyncStorage is not available.
 */
export function createAsyncStorage(): AuthStorage {
  try {
    // Dynamic import to avoid bundling issues
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return {
      getItem: async (key) => AsyncStorage.getItem(key),
      setItem: async (key, value) => AsyncStorage.setItem(key, value),
      removeItem: async (key) => AsyncStorage.removeItem(key),
    };
  } catch {
    console.warn(
      '[FortressAuth] @react-native-async-storage/async-storage not found. Using in-memory storage.',
    );
    return inMemoryStorage;
  }
}

/**
 * Get the default storage for the platform.
 */
export function getDefaultStorage(): AuthStorage {
  return createAsyncStorage();
}

// Export types
export type { AuthStorage };
