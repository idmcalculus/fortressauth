import type { AuthStorage } from '@fortressauth/react-native-sdk';

/**
 * Creates a secure storage adapter using expo-secure-store.
 * Data is encrypted and stored securely on the device.
 */
export function createSecureStorage(): AuthStorage {
  try {
    // Dynamic import to avoid bundling issues
    const SecureStore = require('expo-secure-store');
    return {
      getItem: async (key) => {
        try {
          return await SecureStore.getItemAsync(key);
        } catch {
          return null;
        }
      },
      setItem: async (key, value) => {
        await SecureStore.setItemAsync(key, value);
      },
      removeItem: async (key) => {
        await SecureStore.deleteItemAsync(key);
      },
    };
  } catch {
    console.warn('[FortressAuth] expo-secure-store not found. Using in-memory storage.');
    // Fallback to in-memory storage
    const memoryStorage: Record<string, string> = {};
    return {
      getItem: async (key) => memoryStorage[key] ?? null,
      setItem: async (key, value) => {
        memoryStorage[key] = value;
      },
      removeItem: async (key) => {
        delete memoryStorage[key];
      },
    };
  }
}

/**
 * Gets the default secure storage for Expo apps.
 */
export function getExpoStorage(): AuthStorage {
  return createSecureStorage();
}
