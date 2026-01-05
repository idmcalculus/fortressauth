# @fortressauth/svelte-sdk

Svelte stores for FortressAuth authentication.

## Features

- `createAuthStore` and `getAuthStore` helpers
- Cookie-based sessions with CSRF handling
- Svelte stores for user, loading, and error state

## Installation

```bash
npm install @fortressauth/svelte-sdk
# or
pnpm add @fortressauth/svelte-sdk
# or
yarn add @fortressauth/svelte-sdk
```

## Quick Start

```svelte
<script lang="ts">
  import { createAuthStore } from '@fortressauth/svelte-sdk';

  const auth = createAuthStore({ baseUrl: 'http://localhost:3000' });
  const { user, loading, error, signIn } = auth;

  async function handleLogin() {
    await signIn('user@example.com', 'password123');
  }
</script>

{#if $loading}
  <p>Loading...</p>
{:else if $user}
  <p>Welcome {$user.email}</p>
{:else}
  {#if $error}<p class="error">{$error}</p>{/if}
  <button on:click={handleLogin}>Sign In</button>
{/if}
```

### Environment Variables

For Vite projects, the SDK reads `VITE_API_BASE_URL` automatically:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

## License

MIT
