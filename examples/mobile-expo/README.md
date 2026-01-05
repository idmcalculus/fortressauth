# FortressAuth Expo Example

A complete Expo example demonstrating FortressAuth integration with a unified design system. **This example also works as a reference for React Native CLI projects** with minor modifications.

## Features

- Sign up with email/password (with confirmation)
- Sign in with existing account
- Sign out
- Email verification flow
- Password reset flow
- Secure token storage with expo-secure-store
- Comprehensive form validation
- Accessible UI with proper accessibility labels
- Unified design system matching web examples
- Environment variable configuration
- Email verification status display

## Design System

This example uses a unified design system adapted from the shared CSS design tokens for React Native:

- **Design Tokens**: `styles/designTokens.ts` - Colors, typography, spacing, shadows (adapted from `examples/shared/styles/design-tokens.css`)
- **Components**: Reusable `Input`, `Button`, `Alert`, `Modal`, and `Logo` components
- **Validation**: Shared validation utilities from `examples/shared/utils/validation.ts` (imported via relative path `../../shared/utils/validation`)
- **Logo**: SVG logo component using react-native-svg (matches `examples/shared/assets/logo.svg`)

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

### Environment Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Update the API URL in `app.json` or use environment variables:

```json
// app.json - add to "extra" section
{
  "expo": {
    "extra": {
      "apiUrl": "http://192.168.1.100:5001"
    }
  }
}
```

Or set the environment variable:
```bash
# For local development, use your machine's IP address
# (not localhost, as the mobile device needs to reach the server)
EXPO_PUBLIC_API_URL=http://192.168.1.100:5001
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
import Constants from 'expo-constants';
// OR for React Native CLI:
// import { AuthProvider } from '@fortressauth/react-native-sdk';

// Get API URL from app.json extra config or fallback to default
const getApiUrl = (): string => {
  if (Constants.expoConfig?.extra?.apiUrl) {
    return Constants.expoConfig.extra.apiUrl as string;
  }
  return 'http://localhost:5001';
};

export default function RootLayout() {
  return (
    <AuthProvider baseUrl={getApiUrl()}>
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
  const { signIn, signUp, signOut, verifyEmail, requestPasswordReset, resetPassword } = useAuth();
  const { user, loading, error } = useUser();
  
  // Identical API for both SDKs!
}
```

### Form Validation

```tsx
import {
  validateSignInForm,
  validateSignUpForm,
  sanitizeInput,
  hasErrors,
} from '../../shared/utils/validation';

// Validate sign-in form
const errors = validateSignInForm(email, password);
if (hasErrors(errors)) {
  // Show errors to user
}

// Sanitize inputs before submission
const sanitizedEmail = sanitizeInput(email);
```

## Project Structure

```
mobile-expo/
├── app/
│   ├── _layout.tsx      # Root layout with AuthProvider
│   └── index.tsx        # Main authentication screen
├── components/
│   ├── Alert.tsx        # Feedback alert component
│   ├── Button.tsx       # Button with loading states
│   ├── Input.tsx        # Form input with validation
│   ├── Logo.tsx         # SVG logo component
│   ├── Modal.tsx        # Modal dialog component
│   └── index.ts         # Component exports
├── styles/
│   └── designTokens.ts  # Design system tokens
├── .env.example         # Environment variables template
├── app.json             # Expo configuration
├── metro.config.js      # Metro bundler configuration
├── tsconfig.json        # TypeScript configuration
└── package.json
```

## Learn More

- [FortressAuth Documentation](https://github.com/AaronFortressAgData/fortressauth)
- [Expo Documentation](https://docs.expo.dev)
- [React Native Documentation](https://reactnative.dev)
