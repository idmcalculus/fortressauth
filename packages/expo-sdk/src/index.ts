// Expo-specific exports
export { AuthProvider, useAuth, useUser } from './AuthProvider.js';
export { createSecureStorage, getExpoStorage } from './storage.js';

// Re-export types from react-native-sdk
export type {
	ApiResponse,
	AuthContextValue,
	AuthProviderProps,
	User,
	AuthStorage,
} from '@fortressauth/react-native-sdk';
