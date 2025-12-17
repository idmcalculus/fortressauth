import type { AuthProviderProps } from '@fortressauth/react-native-sdk';
import { AuthProvider as RNAuthProvider } from '@fortressauth/react-native-sdk';
import type React from 'react';
import { useMemo } from 'react';
import { getExpoStorage } from './storage.js';

export interface ExpoAuthProviderProps extends AuthProviderProps {}

/**
 * Expo-optimized AuthProvider that uses SecureStore for encrypted token storage.
 * This is a wrapper around the React Native AuthProvider.
 */
export const AuthProvider: React.FC<ExpoAuthProviderProps> = ({ children, baseUrl }) => {
  const storage = useMemo(() => getExpoStorage(), []);

  return (
    <RNAuthProvider baseUrl={baseUrl} storage={storage}>
      {children}
    </RNAuthProvider>
  );
};

// Re-export hooks from react-native-sdk
export { useAuth, useUser } from '@fortressauth/react-native-sdk';
