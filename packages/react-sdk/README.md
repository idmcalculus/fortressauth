# @fortressauth/react-sdk

React SDK for FortressAuth with hooks-based authentication.

## Features

- React Context + Hooks API
- Cookie-based session management
- Email verification & password reset flows
- TypeScript support
- Works with Vite and Next.js

## Installation

```bash
npm install @fortressauth/react-sdk
# or
pnpm add @fortressauth/react-sdk
# or
yarn add @fortressauth/react-sdk
```

## Quick Start

### 1. Wrap your app with AuthProvider

```tsx
import { AuthProvider } from '@fortressauth/react-sdk';

function App() {
  return (
    <AuthProvider baseUrl="http://localhost:3000">
      <YourApp />
    </AuthProvider>
  );
}
```

### 2. Use the hooks

```tsx
import { useAuth, useUser } from '@fortressauth/react-sdk';

function LoginForm() {
  const { signIn, signUp, loading, error } = useAuth();

  const handleLogin = async (email: string, password: string) => {
    const result = await signIn(email, password);
    if (result.success) {
      // Redirect to dashboard
    }
  };

  return (
    <form onSubmit={/* ... */}>
      {error && <p className="error">{error}</p>}
      {/* form fields */}
    </form>
  );
}

function Profile() {
  const { user, loading } = useUser();

  if (loading) return <p>Loading...</p>;
  if (!user) return <p>Not logged in</p>;

  return <p>Welcome, {user.email}!</p>;
}
```

## Environment Variables

Create a `.env` file:

```bash
# For Vite projects
VITE_API_BASE_URL=http://localhost:3000

# For Next.js projects
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

The SDK auto-detects the environment variable. Alternatively, pass `baseUrl` prop directly to `AuthProvider`.

## API Reference

### AuthProvider

Wrap your app to provide auth context.

```tsx
<AuthProvider 
  baseUrl="http://localhost:3000"  // Optional if env var is set
>
  {children}
</AuthProvider>
```

### useAuth()

Returns the full auth context:

```tsx
const {
  user,           // User | null
  loading,        // boolean
  error,          // string | null
  signUp,         // (email, password) => Promise<ApiResponse>
  signIn,         // (email, password) => Promise<ApiResponse>
  signOut,        // () => Promise<ApiResponse>
  verifyEmail,    // (token) => Promise<ApiResponse>
  requestPasswordReset,  // (email) => Promise<ApiResponse>
  resetPassword,  // (token, newPassword) => Promise<ApiResponse>
  refreshUser,    // () => Promise<void>
} = useAuth();
```

### useUser()

Convenience hook for user state only:

```tsx
const { user, loading, error } = useUser();
```

## Email Verification Flow

```tsx
function VerifyEmailPage() {
  const { verifyEmail } = useAuth();
  const token = new URLSearchParams(location.search).get('token');

  useEffect(() => {
    if (token) {
      verifyEmail(token).then(result => {
        if (result.success) {
          // Show success message
        }
      });
    }
  }, [token]);

  return <p>Verifying your email...</p>;
}
```

## Password Reset Flow

```tsx
// Request reset
const { requestPasswordReset } = useAuth();
await requestPasswordReset('user@example.com');

// Complete reset (on reset page with token)
const { resetPassword } = useAuth();
await resetPassword(token, newPassword);
```

## TypeScript

All types are exported:

```tsx
import type { 
  User, 
  AuthContextValue, 
  AuthProviderProps, 
  ApiResponse 
} from '@fortressauth/react-sdk';
```

## License

MIT
