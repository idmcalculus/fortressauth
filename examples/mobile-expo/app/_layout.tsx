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
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    // baseUrl: Your FortressAuth server URL
    // For React Native CLI, the same props work identically
    <AuthProvider baseUrl="http://localhost:3001">
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
