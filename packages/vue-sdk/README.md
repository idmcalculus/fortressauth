# @fortressauth/vue-sdk

Vue 3 SDK for FortressAuth with composables-based authentication.

## Features

- Vue 3 Composition API
- Cookie-based session management
- Email verification & password reset flows
- TypeScript support
- Works with Vite

## Installation

```bash
npm install @fortressauth/vue-sdk
# or
pnpm add @fortressauth/vue-sdk
# or
yarn add @fortressauth/vue-sdk
```

## Quick Start

### 1. Wrap your app with AuthProvider

```vue
<!-- App.vue -->
<script setup lang="ts">
import { AuthProvider } from '@fortressauth/vue-sdk';
</script>

<template>
  <AuthProvider base-url="http://localhost:3000">
    <RouterView />
  </AuthProvider>
</template>
```

### 2. Use the composables

```vue
<script setup lang="ts">
import { useAuth, useUser } from '@fortressauth/vue-sdk';

const { signIn, signUp, loading, error } = useAuth();
const { user } = useUser();

const handleLogin = async (email: string, password: string) => {
  const result = await signIn(email, password);
  if (result.success) {
    // Redirect to dashboard
  }
};
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="user">Welcome, {{ user.email }}!</div>
  <form v-else @submit.prevent="handleLogin(email, password)">
    <p v-if="error" class="error">{{ error }}</p>
    <!-- form fields -->
  </form>
</template>
```

## Environment Variables

Create a `.env` file:

```bash
# For Vite projects
VITE_API_BASE_URL=http://localhost:3000
```

The SDK auto-detects the environment variable. Alternatively, pass `base-url` prop directly to `AuthProvider`.

## API Reference

### AuthProvider

Wrap your app to provide auth context.

```vue
<AuthProvider 
  base-url="http://localhost:3000"  <!-- Optional if env var is set -->
>
  <slot />
</AuthProvider>
```

### useAuth()

Returns the full auth context:

```ts
const {
  user,           // Ref<User | null>
  loading,        // Ref<boolean>
  error,          // Ref<string | null>
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

Convenience composable for user state only:

```ts
const { user, loading, error } = useUser();
```

## Email Verification Flow

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '@fortressauth/vue-sdk';

const route = useRoute();
const { verifyEmail } = useAuth();

onMounted(async () => {
  const token = route.query.token as string;
  if (token) {
    const result = await verifyEmail(token);
    if (result.success) {
      // Show success message
    }
  }
});
</script>
```

## Password Reset Flow

```ts
// Request reset
const { requestPasswordReset } = useAuth();
await requestPasswordReset('user@example.com');

// Complete reset (on reset page with token)
const { resetPassword } = useAuth();
await resetPassword(token, newPassword);
```

## TypeScript

All types are exported:

```ts
import type { 
  User, 
  AuthContextValue, 
  AuthProviderProps, 
  ApiResponse 
} from '@fortressauth/vue-sdk';
```

## License

MIT
