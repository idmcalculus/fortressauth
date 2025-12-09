# @fortressauth/core

Secure-by-default, database-agnostic authentication library built with hexagonal architecture.

## Features

- 🔒 **Secure by Default**: Argon2id password hashing, SHA-256 session tokens, timing-attack prevention
- 🏗️ **Hexagonal Architecture**: Clean separation of business logic from infrastructure
- 📦 **Database Agnostic**: Works with any database through adapter pattern
- 🎯 **Type Safe**: Built with TypeScript 5.7+ in strict mode
- ⚡ **Zero Dependencies**: Core logic has minimal dependencies
- 🛡️ **Rate Limiting**: Built-in token bucket rate limiter
- 🔐 **Account Lockout**: Automatic lockout after failed login attempts

## Installation

```bash
npm install @fortressauth/core
# or
pnpm add @fortressauth/core
# or
yarn add @fortressauth/core
```

## Quick Start

```typescript
import { FortressAuth, MemoryRateLimiter } from '@fortressauth/core';
import { SqlAdapter } from '@fortressauth/adapter-sql';

// Initialize with your database adapter
const adapter = new SqlAdapter(db);
const rateLimiter = new MemoryRateLimiter();

const fortress = new FortressAuth({
  repository: adapter,
  rateLimiter,
  config: {
    session: {
      ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
    password: {
      minLength: 8,
      maxLength: 128,
    },
  },
});

// Sign up a new user
const signupResult = await fortress.signUp({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});

if (signupResult.success) {
  const { user, token } = signupResult.data;
  // Store token in cookie or return to client
}

// Sign in
const signinResult = await fortress.signIn({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});

// Validate session
const sessionResult = await fortress.validateSession(token);
```

## Security Features

### Password Hashing
Uses Argon2id with OWASP-recommended parameters:
- Memory cost: 19456 KB
- Time cost: 2 iterations
- Parallelism: 1 thread

### Session Tokens
- 32 bytes of cryptographic randomness
- Stored as SHA-256 hash in database
- Raw token returned only once to client

### Rate Limiting
Token bucket algorithm with configurable limits:
- Default: 5 attempts per 15 minutes for login
- Prevents brute force attacks

### Account Lockout
- Configurable failed attempt threshold
- Automatic unlock after duration
- Prevents credential stuffing

## Architecture

FortressAuth follows hexagonal architecture principles:

- **Domain Entities**: User, Account, Session, LoginAttempt
- **Ports**: AuthRepository, RateLimiterPort (interfaces)
- **Use Cases**: FortressAuth class orchestrates business logic
- **Adapters**: Implement ports for specific infrastructure (SQL, Redis, etc.)

## API Reference

See [full documentation](https://github.com/idmcalculus/fortressauth) for detailed API reference.

## License

MIT
