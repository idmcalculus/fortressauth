# FortressAuth Expo Example

A complete Expo example demonstrating FortressAuth integration. **This example also works as a reference for React Native CLI projects** with minor modifications.

## Features

- Sign up with email/password (with confirmation)
- Sign in with existing account
- Sign out
- Secure token storage with expo-secure-store
- Beautiful mobile-native UI

## Expo vs React Native CLI

| Feature | Expo SDK | React Native SDK |
|---------|----------|------------------|
| Package | `@fortressauth/expo-sdk` | `@fortressauth/react-native-sdk` |
| Token Storage | SecureStore (encrypted) | AsyncStorage |
| Setup | Zero config | Requires linking |

### Using with React Native CLI

To adapt this example for React Native CLI:

```tsx
// Change this import:
import { AuthProvider, useAuth, useUser } from '@fortressauth/expo-sdk';

// To this:
import { AuthProvider, useAuth, useUser } from '@fortressauth/react-native-sdk';
```

> **Note**: React Native SDK uses AsyncStorage by default. For encrypted storage in RN CLI, 
> you can provide a custom storage adapter (e.g., react-native-keychain).

## Getting Started

### Prerequisites

1. Install Expo CLI: `npm install -g expo-cli`
2. Make sure the FortressAuth server is running:

```bash
# From the monorepo root
pnpm --filter @fortressauth/server dev
```

### Running the Example

```bash
# From the monorepo root
pnpm --filter fortressauth-mobile-expo dev
```

Then scan the QR code with Expo Go or run on a simulator.

## SDK Usage

### Setup AuthProvider

```tsx
// app/_layout.tsx
import { AuthProvider } from '@fortressauth/expo-sdk';
// OR for React Native CLI:
// import { AuthProvider } from '@fortressauth/react-native-sdk';

export default function RootLayout() {
  return (
    <AuthProvider baseUrl="http://your-api.com">
      <Stack />
    </AuthProvider>
  );
}
```

### Using Hooks

```tsx
import { useAuth, useUser } from '@fortressauth/expo-sdk';
// Same hooks work with @fortressauth/react-native-sdk

function MyComponent() {
  const { signIn, signUp, signOut } = useAuth();
  const { user, loading } = useUser();
  
  // Identical API for both SDKs!
}
```

## Learn More

- [FortressAuth Documentation](https://github.com/AaronFortressAgData/fortressauth)
- [Expo Documentation](https://docs.expo.dev)
- [React Native Documentation](https://reactnative.dev)
