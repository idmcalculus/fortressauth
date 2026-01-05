# FortressAuth Svelte Example

A complete SvelteKit example demonstrating FortressAuth integration with the Svelte SDK.

## Features

- Sign up with email/password
- Sign in with existing account
- Sign out
- Display user information and email verification status
- Beautiful, modern UI with glassmorphism design

## Getting Started

### Prerequisites

Make sure the FortressAuth server is running:

```bash
# From the monorepo root
pnpm --filter @fortressauth/server dev
```

### Running the Example

```bash
# From the monorepo root
pnpm --filter fortressauth-web-svelte dev
```

The app will open at http://localhost:5175

## SDK Usage

### Creating an Auth Store

```typescript
import { createAuthStore } from '@fortressauth/svelte-sdk';

const auth = createAuthStore({ baseUrl: 'http://localhost:3001' });
const { user, loading, error } = auth;
```

### Using in Components

```svelte
<script>
  import { createAuthStore } from '@fortressauth/svelte-sdk';
  
  const auth = createAuthStore();
  const { user, loading } = auth;
</script>

{#if $loading}
  <p>Loading...</p>
{:else if $user}
  <p>Welcome, {$user.email}!</p>
  <button on:click={() => auth.signOut()}>Sign Out</button>
{:else}
  <button on:click={() => auth.signIn(email, password)}>Sign In</button>
{/if}
```

## Learn More

- [FortressAuth Documentation](https://github.com/AaronFortressAgData/fortressauth)
- [SvelteKit Documentation](https://kit.svelte.dev)
