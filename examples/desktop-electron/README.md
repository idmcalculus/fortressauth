# FortressAuth Electron Example

A complete Electron desktop application demonstrating FortressAuth integration with secure local storage.

## Features

- Sign up with email/password (with confirmation)
- Sign in with existing account
- Sign out
- Encrypted token storage with electron-store
- Native desktop UI with glassmorphism design

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
pnpm --filter fortressauth-desktop-electron dev
```

## SDK Usage

### Creating an Auth Client

```javascript
const { createAuth } = require('@fortressauth/electron-sdk');

const auth = createAuth({ baseUrl: 'http://localhost:3001' });
```

### Subscribing to State Changes

```javascript
auth.subscribe((state) => {
  console.log('User:', state.user);
  console.log('Loading:', state.loading);
  console.log('Error:', state.error);
});
```

### Authentication Methods

```javascript
// Sign up
await auth.signUp('user@example.com', 'password123');

// Sign in
await auth.signIn('user@example.com', 'password123');

// Sign out
await auth.signOut();
```

## Learn More

- [FortressAuth Documentation](https://github.com/AaronFortressAgData/fortressauth)
- [Electron Documentation](https://www.electronjs.org/docs)
