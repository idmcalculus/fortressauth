# @fortressauth/electron-sdk

Electron client for FortressAuth with token-based authentication.

## Features

- `FortressAuth` class with subscribe/getState helpers
- Token storage via `electron-store` (overrideable)
- Works with main or renderer processes that have access to fetch

## Installation

```bash
npm install @fortressauth/electron-sdk
# or
pnpm add @fortressauth/electron-sdk
# or
yarn add @fortressauth/electron-sdk
```

## Quick Start

```ts
import { FortressAuth } from '@fortressauth/electron-sdk';

const auth = new FortressAuth({ baseUrl: 'http://localhost:3000' });

const unsubscribe = auth.subscribe((state) => {
  console.log('user', state.user);
});

await auth.signIn('user@example.com', 'password123');
```

## License

MIT
