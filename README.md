# FortressAuth

A secure-by-default, database-agnostic authentication library built with TypeScript and hexagonal architecture.

## Features

- Secure by Default: Argon2id password hashing, split session tokens (selector + hashed verifier), timing-attack prevention
- Hexagonal Architecture: Clean separation between business logic and infrastructure
- Database Agnostic: Works with PostgreSQL, MySQL, and SQLite via Kysely
- Email Provider Agnostic: Pluggable email providers (console, Resend, SES, SendGrid, SMTP, or custom)
- Production Ready: Email verification, password reset, rate limiting (memory/Redis), account lockout, session management
- OpenAPI Documentation: Auto-generated API docs with Scalar UI
- Docker Ready: Multi-stage Dockerfile with security best practices
- SDKs: React, Vue, Angular, Svelte, React Native, Expo, Electron SDKs with example apps

## Packages

| Package | Description |
|---------|-------------|
| [@fortressauth/core](./packages/core) | Business logic, domain entities, ports |
| [@fortressauth/adapter-sql](./packages/adapter-sql) | SQL adapter for PostgreSQL, MySQL, SQLite |
| [@fortressauth/server](./packages/server) | Standalone HTTP server |
| [@fortressauth/react-sdk](./packages/react-sdk) | React hooks & context |
| [@fortressauth/vue-sdk](./packages/vue-sdk) | Vue composables & provider |
| [@fortressauth/angular-sdk](./packages/angular-sdk) | Angular service wrapper |
| [@fortressauth/svelte-sdk](./packages/svelte-sdk) | Svelte stores and helpers |
| [@fortressauth/react-native-sdk](./packages/react-native-sdk) | React Native hooks & provider (token-based) |
| [@fortressauth/expo-sdk](./packages/expo-sdk) | Expo wrapper with SecureStore |
| [@fortressauth/electron-sdk](./packages/electron-sdk) | Electron client (token-based) |
| [@fortressauth/email-ses](./packages/email-ses) | AWS SES email provider |
| [@fortressauth/email-sendgrid](./packages/email-sendgrid) | SendGrid email provider |
| [@fortressauth/email-smtp](./packages/email-smtp) | SMTP email provider |

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
EMAIL_PROVIDER=console   # or 'resend', 'ses', 'sendgrid', 'smtp'
RESEND_API_KEY=          # required for resend
EMAIL_FROM_ADDRESS=      # required for resend
EMAIL_FROM_NAME=         # optional
SES_REGION=              # required for ses
SES_ACCESS_KEY_ID=       # required for ses
SES_SECRET_ACCESS_KEY=   # required for ses
SES_SESSION_TOKEN=       # optional for ses
SES_FROM_ADDRESS=        # required for ses
SES_FROM_NAME=           # optional for ses
SENDGRID_API_KEY=        # required for sendgrid
SENDGRID_FROM_ADDRESS=   # required for sendgrid
SENDGRID_FROM_NAME=      # optional for sendgrid
SMTP_HOST=               # required for smtp
SMTP_PORT=               # required for smtp
SMTP_SECURE=false        # optional for smtp
SMTP_USER=               # optional for smtp
SMTP_PASS=               # optional for smtp
SMTP_FROM_ADDRESS=       # required for smtp
SMTP_FROM_NAME=          # optional for smtp
SMTP_TLS_REJECT_UNAUTHORIZED= # optional for smtp
SMTP_TLS_SERVERNAME=     # optional for smtp

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

### AWS SES
```bash
EMAIL_PROVIDER=ses
SES_REGION=us-east-1
SES_ACCESS_KEY_ID=...
SES_SECRET_ACCESS_KEY=...
SES_SESSION_TOKEN=        # optional
SES_FROM_ADDRESS=noreply@yourdomain.com
SES_FROM_NAME=Your App
```

### SendGrid
```bash
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=...
SENDGRID_FROM_ADDRESS=noreply@yourdomain.com
SENDGRID_FROM_NAME=Your App
```

### SMTP
```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM_ADDRESS=noreply@yourdomain.com
SMTP_FROM_NAME=Your App
SMTP_TLS_REJECT_UNAUTHORIZED=false
SMTP_TLS_SERVERNAME=smtp.example.com
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
- `examples/web-angular` - Angular example app
- `examples/web-svelte` - Svelte example app
- `examples/mobile-expo` - Expo example app
- `examples/desktop-electron` - Electron example app
- `examples/basic-usage` - Basic Node.js usage

## License

MIT
