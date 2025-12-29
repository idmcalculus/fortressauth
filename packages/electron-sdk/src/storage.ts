import type { AuthStorage } from './types.js';

// In-memory fallback storage
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
 * Creates a storage adapter using electron-store.
 * Data is persisted to disk and encrypted by default.
 */
export function createElectronStorage(prefix = 'fortress'): AuthStorage {
  try {
    // Dynamic import to handle bundling
    const Store = require('electron-store');
    const store = new Store({
      name: `${prefix}-auth`,
      encryptionKey: 'fortress-secure-storage',
    });

    return {
      getItem: async (key) => {
        const value = store.get(key);
        return typeof value === 'string' ? value : null;
      },
      setItem: async (key, value) => {
        store.set(key, value);
      },
      removeItem: async (key) => {
        store.delete(key);
      },
    };
  } catch {
    console.warn('[FortressAuth] electron-store not available. Using in-memory storage.');
    return inMemoryStorage;
  }
}

/**
 * Gets the default storage for Electron apps.
 */
export function getDefaultStorage(prefix = 'fortress'): AuthStorage {
  return createElectronStorage(prefix);
}

export { inMemoryStorage };
