# @fortressauth/expo-sdk

Expo SDK for FortressAuth with SecureStore-backed token storage.

## Features

- Expo-optimized `AuthProvider`
- Uses `expo-secure-store` for token storage
- Re-exports `useAuth` and `useUser` hooks

## Installation

```bash
npm install @fortressauth/expo-sdk
# or
pnpm add @fortressauth/expo-sdk
# or
yarn add @fortressauth/expo-sdk
```

## Quick Start

```tsx
import { AuthProvider, useAuth, useUser } from '@fortressauth/expo-sdk';

export function App() {
  return (
    <AuthProvider baseUrl="http://localhost:3000">
      <Root />
    </AuthProvider>
  );
}
```

## License

MIT
