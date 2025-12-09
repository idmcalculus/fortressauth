# @fortressauth/adapter-sql

SQL database adapter for FortressAuth using Kysely query builder.

## Features

- 🗄️ **Multi-Database Support**: PostgreSQL, MySQL, SQLite
- 🔍 **Type-Safe Queries**: Powered by Kysely
- 🔄 **Transactions**: Full transaction support
- 📊 **Migrations**: Built-in migration system

## Installation

```bash
npm install @fortressauth/adapter-sql @fortressauth/core kysely
# or
pnpm add @fortressauth/adapter-sql @fortressauth/core kysely
# or
yarn add @fortressauth/adapter-sql @fortressauth/core kysely
```

You'll also need a database driver:

```bash
# For PostgreSQL
npm install pg

# For MySQL
npm install mysql2

# For SQLite
npm install better-sqlite3
```

## Quick Start

### SQLite

```typescript
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { SqlAdapter, up } from '@fortressauth/adapter-sql';

const sqlite = new Database('./auth.db');
const db = new Kysely({
  dialect: new SqliteDialect({ database: sqlite }),
});

// Run migrations
await up(db);

// Create adapter
const adapter = new SqlAdapter(db, { dialect: 'sqlite' });
```

### PostgreSQL

```typescript
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { SqlAdapter, up } from '@fortressauth/adapter-sql';

const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: 'localhost',
      database: 'auth',
    }),
  }),
});

await up(db);
const adapter = new SqlAdapter(db, { dialect: 'postgres' });
```

### MySQL

```typescript
import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import { SqlAdapter, up } from '@fortressauth/adapter-sql';

const db = new Kysely({
  dialect: new MysqlDialect({
    pool: createPool({
      host: 'localhost',
      database: 'auth',
    }),
  }),
});

await up(db);
const adapter = new SqlAdapter(db, { dialect: 'mysql' });
```

## Database Schema

The adapter creates four tables:

- **users**: User accounts with email verification and lockout support
- **accounts**: Provider-specific accounts (email, OAuth)
- **sessions**: Active user sessions with expiration
- **login_attempts**: Login attempt history for rate limiting

## Migrations

```typescript
import { up, down } from '@fortressauth/adapter-sql';

// Apply migrations
await up(db);

// Rollback migrations
await down(db);
```

## Transactions

```typescript
await adapter.transaction(async (txRepo) => {
  const user = User.create('user@example.com');
  await txRepo.createUser(user);
  
  const account = Account.createEmailAccount(
    user.id,
    'user@example.com',
    passwordHash
  );
  await txRepo.createAccount(account);
});
```

## License

MIT
