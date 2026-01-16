# @fortressauth/adapter-mongodb

MongoDB adapter for FortressAuth using the official MongoDB Node.js driver.

## Features

- Native MongoDB storage with typed collections
- Automatic index creation helper
- Transactions with replica set support and graceful fallback
- Full AuthRepository implementation

## Installation

```bash
npm install @fortressauth/adapter-mongodb @fortressauth/core mongodb
# or
pnpm add @fortressauth/adapter-mongodb @fortressauth/core mongodb
# or
yarn add @fortressauth/adapter-mongodb @fortressauth/core mongodb
```

## Connection Examples

```bash
# Local MongoDB
MONGODB_URL=mongodb://user:password@localhost:27017/fortressauth

# MongoDB Atlas
MONGODB_URL=mongodb+srv://user:password@cluster.mongodb.net/fortressauth
```

## Quick Start

```typescript
import { MongoClient } from 'mongodb';
import { MongoAdapter } from '@fortressauth/adapter-mongodb';

const client = new MongoClient(process.env.MONGODB_URL!);
await client.connect();

const adapter = new MongoAdapter({
  client,
  databaseName: 'fortressauth',
});

await adapter.ensureIndexes();
```

## Collections & Schemas

The adapter uses the following collections (names are configurable):

- `users`: `{ _id, email, emailVerified, createdAt, updatedAt, lockedUntil }`
- `accounts`: `{ _id, userId, providerId, providerUserId, passwordHash, createdAt }`
- `sessions`: `{ _id, userId, selector, verifierHash, expiresAt, ipAddress, userAgent, createdAt }`
- `email_verifications`: `{ _id, userId, selector, verifierHash, expiresAt, createdAt }`
- `password_resets`: `{ _id, userId, selector, verifierHash, expiresAt, createdAt }`
- `login_attempts`: `{ _id, userId, email, ipAddress, success, createdAt }`

You can override collection names:

```typescript
const adapter = new MongoAdapter({
  client,
  databaseName: 'fortressauth',
  collections: {
    emailVerifications: 'auth_email_verifications',
    passwordResets: 'auth_password_resets',
  },
});
```

## Index Requirements

Call `ensureIndexes()` once during startup to create required indexes:

- `users.email` unique
- `accounts.providerId + accounts.providerUserId` unique
- `sessions.selector` unique
- `sessions.expiresAt` TTL (auto cleanup)
- `email_verifications.selector` unique
- `password_resets.selector` unique
- Support indexes for lookups (userId, email + createdAt)

## Transactions

MongoDB transactions require a replica set or sharded cluster. For local development:

```bash
mongod --replSet rs0
mongosh --eval "rs.initiate()"
```

The adapter automatically falls back to non-transactional execution if transactions are not
supported. You can also disable transactions explicitly:

```typescript
const adapter = new MongoAdapter({
  client,
  databaseName: 'fortressauth',
  enableTransactions: false,
});
```

## Database Permissions

The MongoDB user must be able to:

- Read and write all collections used by the adapter
- Create and drop indexes

## License

MIT
