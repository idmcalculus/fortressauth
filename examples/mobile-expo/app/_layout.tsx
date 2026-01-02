/**
 * FortressAuth Mobile Example
 *
 * This example uses @fortressauth/expo-sdk which provides SecureStore
 * for encrypted token storage.
 *
 * FOR REACT NATIVE CLI PROJECTS:
 * Replace the import below with:
 *   import { AuthProvider } from '@fortressauth/react-native-sdk';
 *
 * The React Native SDK uses AsyncStorage by default. For encrypted storage,
 * you can pass a custom storage adapter to AuthProvider.
 */
import { AuthProvider } from '@fortressauth/expo-sdk';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';

// Get API URL from environment variables
// For Expo, use EXPO_PUBLIC_ prefix for environment variables
// Constants.expoConfig?.extra?.apiUrl can be set in app.json/app.config.js
const getApiUrl = (): string => {
  // First try extra config from app.json
  if (Constants.expoConfig?.extra?.apiUrl) {
    return Constants.expoConfig.extra.apiUrl as string;
  }
  // Fall back to default
  return 'http://localhost:5001';
};

const API_URL = getApiUrl();

export default function RootLayout() {
  return (
    // baseUrl: Your FortressAuth server URL
    // For React Native CLI, the same props work identically
    <AuthProvider baseUrl={API_URL}>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
