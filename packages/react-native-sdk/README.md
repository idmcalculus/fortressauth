# @fortressauth/react-native-sdk

React Native SDK for FortressAuth with token-based authentication.

## Features

- `AuthProvider` with `useAuth` and `useUser` hooks
- Token-based auth (no cookies)
- AsyncStorage-backed token storage (overrideable)

## Installation

```bash
npm install @fortressauth/react-native-sdk
# or
pnpm add @fortressauth/react-native-sdk
# or
yarn add @fortressauth/react-native-sdk
```

## Quick Start

```tsx
import { AuthProvider, useAuth, useUser } from '@fortressauth/react-native-sdk';

export function App() {
  return (
    <AuthProvider baseUrl="http://localhost:3000">
      <Root />
    </AuthProvider>
  );
}

function Root() {
  const { signIn, loading, error } = useAuth();
  const { user } = useUser();

  return null;
}
```

### Custom Storage

```tsx
import type { AuthStorage } from '@fortressauth/react-native-sdk';

const storage: AuthStorage = {
  getItem: async (key) => /* ... */,
  setItem: async (key, value) => /* ... */,
  removeItem: async (key) => /* ... */,
};

<AuthProvider baseUrl="http://localhost:3000" storage={storage}>
  <App />
</AuthProvider>
```

## License

MIT
