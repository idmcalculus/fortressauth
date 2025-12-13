# FortressAuth

A secure-by-default, database-agnostic authentication library built with TypeScript and hexagonal architecture.

## Features

- Secure by Default: Argon2id password hashing, split session tokens (selector + hashed verifier), timing-attack prevention
- Hexagonal Architecture: Clean separation between business logic and infrastructure
- Database Agnostic: Works with PostgreSQL, MySQL, and SQLite via Kysely
- Email Provider Agnostic: Pluggable email providers (console, Resend, or custom)
- Production Ready: Email verification, password reset, rate limiting (memory/Redis), account lockout, session management
- OpenAPI Documentation: Auto-generated API docs with Scalar UI
- Docker Ready: Multi-stage Dockerfile with security best practices
- SDKs: React and Vue SDKs with cookie-aware flows and example apps

## Packages

| Package | Description |
|---------|-------------|
| [@fortressauth/core](./packages/core) | Business logic, domain entities, ports |
| [@fortressauth/adapter-sql](./packages/adapter-sql) | SQL adapter for PostgreSQL, MySQL, SQLite |
| [@fortressauth/server](./packages/server) | Standalone HTTP server |
| [@fortressauth/react-sdk](./packages/react-sdk) | React hooks & context |
| [@fortressauth/vue-sdk](./packages/vue-sdk) | Vue composables & provider |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 10+

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint
```

### Development

```bash
# Start development server (with examples)
pnpm dev
```

The server will start at `http://localhost:3000`. Visit `http://localhost:3000/docs` for API documentation.

### Docker

```bash
# Build and run with Docker Compose
cd docker
docker-compose up --build
```

## Environment Variables

### Server

```bash
# Server
PORT=3000
HOST=0.0.0.0
DATABASE_URL=./fortress.db
BASE_URL=http://localhost:3000

# Security
COOKIE_SECURE=false
COOKIE_SAMESITE=strict

# Email Provider
EMAIL_PROVIDER=console   # or 'resend'
RESEND_API_KEY=          # required for resend
EMAIL_FROM_ADDRESS=      # required for resend
EMAIL_FROM_NAME=         # optional

# Optional
REDIS_URL=               # for distributed rate limiting
CORS_ORIGINS=            # comma-separated origins
LOG_LEVEL=info
METRICS_ENABLED=true
```

### Client SDKs

```bash
# Vite projects
VITE_API_BASE_URL=http://localhost:3000

# Next.js projects
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

## API Endpoints

- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics (if enabled)
- `GET /docs` - API documentation
- `GET /openapi.json` - OpenAPI specification
- `POST /auth/signup` - Create new account
- `POST /auth/login` - Sign in
- `POST /auth/logout` - Sign out
- `GET /auth/me` - Get current user
- `POST /auth/verify-email` - Verify email via selector:verifier token
- `POST /auth/request-password-reset` - Send password reset email
- `POST /auth/reset-password` - Reset password with selector:verifier token

## Security Features

- **Password Hashing**: Argon2id with OWASP-recommended parameters
- **Session Tokens**: 32-byte cryptographic random tokens, stored as SHA-256 hashes
- **Timing Attack Prevention**: Constant-time comparisons for secrets
- **Rate Limiting**: Token bucket algorithm with configurable limits
- **Account Lockout**: Automatic lockout after failed login attempts
- **Secure Cookies**: HttpOnly, SameSite, Secure flags

## Email Configuration

FortressAuth supports pluggable email providers:

### Console (Development)
```bash
EMAIL_PROVIDER=console
```
Logs verification links to terminal - perfect for development.

### Resend (Production)
```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=Your App
```

### Custom Provider
Implement the `EmailProviderPort` interface from `@fortressauth/core`.

## Architecture

FortressAuth follows hexagonal architecture principles:

- **Core**: Contains all business logic with zero infrastructure dependencies
- **Ports**: Interfaces that define contracts for external services
- **Adapters**: Implementations of ports for specific technologies

## Examples

- `examples/web-react` - React + Vite example app
- `examples/web-vue` - Vue + Vite example app
- `examples/basic-usage` - Basic Node.js usage

## License

MIT