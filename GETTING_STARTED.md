# Getting Started with FortressAuth

This guide will help you get FortressAuth up and running quickly.

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Using the Standalone Server](#using-the-standalone-server)
4. [Integration Examples](#integration-examples)
5. [Next Steps](#next-steps)

## Installation

### As a Library

Install the core package and a database adapter:

```bash
npm install @fortressauth/core @fortressauth/adapter-sql kysely better-sqlite3
```

Or with pnpm:

```bash
pnpm add @fortressauth/core @fortressauth/adapter-sql kysely better-sqlite3
```

### As a Standalone Server

Using Docker (recommended):

```bash
docker pull idmcalculus/fortressauth:latest
docker run -d -p 3000:3000 idmcalculus/fortressauth:latest
```

Or clone and run:

```bash
git clone https://github.com/idmcalculus/fortressauth.git
cd fortressauth
docker-compose up
```

## Quick Start

### 1. Setup Database

```typescript
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { SqlAdapter, up } from '@fortressauth/adapter-sql';

// Create database connection
const sqlite = new Database('./auth.db');
const db = new Kysely({
  dialect: new SqliteDialect({ database: sqlite }),
});

// Run migrations
await up(db);

// Create adapter
const adapter = new SqlAdapter(db, { dialect: 'sqlite' });
```

### 2. Initialize FortressAuth

```typescript
import { FortressAuth, MemoryRateLimiter } from '@fortressauth/core';

const fortress = new FortressAuth({
  repository: adapter,
  rateLimiter: new MemoryRateLimiter(),
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
```

### 3. Use Authentication

```typescript
// Sign up a new user
const signupResult = await fortress.signUp({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});

if (signupResult.success) {
  const { user, token } = signupResult.data;
  console.log('User created:', user.email);
  console.log('Session token:', token);
}

// Sign in
const signinResult = await fortress.signIn({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});

if (signinResult.success) {
  const { user, token } = signinResult.data;
  // Store token in cookie or return to client
}

// Validate session
const sessionResult = await fortress.validateSession(token);

if (sessionResult.success) {
  const { user } = sessionResult.data;
  console.log('Authenticated user:', user.email);
}

// Sign out
await fortress.signOut(token);
```

## Using the Standalone Server

### Start the Server

```bash
# Using Docker
docker run -d -p 3000:3000 \
  -e DATABASE_URL=./fortress.db \
  -e COOKIE_SECURE=false \
  idmcalculus/fortressauth:latest

# Or locally
cd packages/server
pnpm install
pnpm build
pnpm start
```

### API Endpoints

Visit `http://localhost:3000/docs` for interactive API documentation.

#### Sign Up

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

Response:
```json
{
  "success": true,
  "user": {
    "id": "01234567-89ab-cdef-0123-456789abcdef",
    "email": "user@example.com",
    "emailVerified": false,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Sign In

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

#### Get Current User

```bash
curl http://localhost:3000/auth/me \
  -H "Cookie: fortress_session=your-session-token"
```

#### Sign Out

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Cookie: fortress_session=your-session-token"
```

## Integration Examples

### Express.js

```typescript
import express from 'express';
import { FortressAuth, MemoryRateLimiter } from '@fortressauth/core';
import { SqlAdapter } from '@fortressauth/adapter-sql';

const app = express();
app.use(express.json());

const fortress = new FortressAuth({
  repository: adapter,
  rateLimiter: new MemoryRateLimiter(),
});

app.post('/signup', async (req, res) => {
  const result = await fortress.signUp(req.body);
  
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  
  res.cookie('session', result.data.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  
  res.json({ user: result.data.user });
});

app.post('/login', async (req, res) => {
  const result = await fortress.signIn(req.body);
  
  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }
  
  res.cookie('session', result.data.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  
  res.json({ user: result.data.user });
});

app.get('/me', async (req, res) => {
  const token = req.cookies.session;
  
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const result = await fortress.validateSession(token);
  
  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }
  
  res.json({ user: result.data.user });
});

app.listen(3000);
```

### Next.js API Routes

```typescript
// pages/api/auth/signup.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { fortress } from '@/lib/fortress';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await fortress.signUp(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.setHeader('Set-Cookie', `session=${result.data.token}; HttpOnly; Secure; SameSite=Lax; Path=/`);
  res.json({ user: result.data.user });
}
```

### Fastify

```typescript
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { FortressAuth, MemoryRateLimiter } from '@fortressauth/core';

const fastify = Fastify();
await fastify.register(cookie);

const fortress = new FortressAuth({
  repository: adapter,
  rateLimiter: new MemoryRateLimiter(),
});

fastify.post('/signup', async (request, reply) => {
  const result = await fortress.signUp(request.body);
  
  if (!result.success) {
    return reply.code(400).send({ error: result.error });
  }
  
  reply.setCookie('session', result.data.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  
  return { user: result.data.user };
});

await fastify.listen({ port: 3000 });
```

## Next Steps

### Production Deployment

1. **Choose a Database**: Use PostgreSQL or MySQL for production
2. **Enable HTTPS**: Set `COOKIE_SECURE=true`
3. **Configure Environment**: Set proper environment variables
4. **Set Up Monitoring**: Add health checks and logging
5. **Enable Backups**: Configure database backups

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

### Advanced Features

- **Rate Limiting**: Configure custom rate limits
- **Account Lockout**: Adjust lockout thresholds
- **Session Management**: Customize session TTL
- **Password Policies**: Set password requirements

See the [API documentation](./packages/core/README.md) for more details.

### Examples

Check out the [examples directory](./examples) for more integration examples:
- Basic usage
- Express.js integration
- Next.js integration
- PostgreSQL setup

## Getting Help

- **Documentation**: https://github.com/idmcalculus/fortressauth
- **Issues**: https://github.com/idmcalculus/fortressauth/issues
- **Discussions**: https://github.com/idmcalculus/fortressauth/discussions

## What's Next?

- Explore the [API Reference](./packages/core/README.md)
- Read the [Deployment Guide](./DEPLOYMENT.md)
- Check out [Contributing Guidelines](./CONTRIBUTING.md)
- Review [Security Best Practices](./README.md#security)
