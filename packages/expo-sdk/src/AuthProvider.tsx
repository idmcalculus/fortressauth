import type { AuthStorage } from '@fortressauth/react-native-sdk';
import { AuthProvider as RNAuthProvider } from '@fortressauth/react-native-sdk';
import type React from 'react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { getExpoStorage } from './storage.js';

export interface ExpoAuthProviderProps {
  children: ReactNode;
  baseUrl?: string;
}

/**
 * Expo-optimized AuthProvider that uses SecureStore for encrypted token storage.
 * This is a wrapper around the React Native AuthProvider.
 */
export const AuthProvider = ({ children, baseUrl }: ExpoAuthProviderProps): React.JSX.Element => {
  const storage: AuthStorage = useMemo(() => getExpoStorage(), []);

  return (
    <RNAuthProvider baseUrl={baseUrl ?? ''} storage={storage}>
      {children}
    </RNAuthProvider>
  );
};

// Re-export hooks from react-native-sdk
export { useAuth, useUser } from '@fortressauth/react-native-sdk';
