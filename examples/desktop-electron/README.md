# FortressAuth Electron Example

A complete Electron desktop application demonstrating FortressAuth integration with secure local storage.

## Features

- Sign up with email/password (with confirmation)
- Sign in with existing account
- Sign out
- Email verification flow
- Password reset flow
- Encrypted token storage with electron-store
- Native desktop UI with unified design system
- Comprehensive form validation
- Accessible UI with ARIA labels and keyboard navigation
- Loading states and user feedback via alerts

## Getting Started

### Prerequisites

Make sure the FortressAuth server is running:

```bash
# From the monorepo root
pnpm --filter @fortressauth/server dev
```

### Configuration

Copy the `.env.example` file to `.env` and configure the API URL:

```bash
cp .env.example .env
```

Environment variables:
- `FORTRESSAUTH_API_URL` - The URL of the FortressAuth server (default: `http://localhost:3000`)
- `NODE_ENV` - Set to `development` to enable DevTools

### Running the Example

```bash
# From the monorepo root
pnpm --filter fortressauth-desktop-electron dev
```

Or in production mode:

```bash
pnpm --filter fortressauth-desktop-electron start
```

## SDK Usage

### Creating an Auth Client

```javascript
const { createAuth } = require('@fortressauth/electron-sdk');

const auth = createAuth({ baseUrl: 'http://localhost:3000' });
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
const result = await auth.signUp('user@example.com', 'password123');
if (result.success) {
  console.log('Account created! Check email for verification.');
}

// Sign in
const result = await auth.signIn('user@example.com', 'password123');
if (result.success) {
  console.log('Signed in!', result.data.user);
}

// Sign out
await auth.signOut();

// Verify email
const result = await auth.verifyEmail('selector:verifier');
if (result.success) {
  console.log('Email verified!');
}

// Request password reset
await auth.requestPasswordReset('user@example.com');

// Reset password
const result = await auth.resetPassword('selector:verifier', 'newPassword123');
if (result.success) {
  console.log('Password reset successful!');
}
```

## Design System

This example uses the shared FortressAuth design system located in `examples/shared/`:

- **Styles**: `examples/shared/styles/index.css` - Unified CSS design tokens and components
- **Validation**: `examples/shared/utils/validation.ts` - Form validation utilities
- **Assets**: `examples/shared/assets/logo.svg` - Shared logo

## Learn More

- [FortressAuth Documentation](https://github.com/AaronFortressAgData/fortressauth)
- [Electron Documentation](https://www.electronjs.org/docs)
