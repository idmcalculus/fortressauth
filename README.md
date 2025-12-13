# FortressAuth

A secure-by-default, database-agnostic authentication library built with TypeScript and hexagonal architecture.

## Features

- 🔒 **Secure by Default**: Argon2id password hashing, split session tokens (selector + hashed verifier), timing-attack prevention
- 🏗️ **Hexagonal Architecture**: Clean separation between business logic and infrastructure
- 🗄️ **Database Agnostic**: Works with PostgreSQL, MySQL, and SQLite via Kysely
- 🚀 **Production Ready**: Email verification, password reset, rate limiting (memory/Redis), account lockout, session management
- 📖 **OpenAPI Documentation**: Auto-generated API docs with Scalar UI
- 🐳 **Docker Ready**: Multi-stage Dockerfile with security best practices
- 🧩 **SDKs**: React and Vue SDKs with cookie-aware flows and example apps

## Project Structure

```
fortressauth/
├── packages/
│   ├── core/              # Business logic, domain entities, ports
│   ├── adapter-sql/       # SQL adapter implementation
│   └── server/            # Standalone HTTP server
└── docker/                # Docker configuration
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+

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
# Start development server
cd packages/server
pnpm dev
```

The server will start at `http://localhost:3000`. Visit `http://localhost:3000/docs` for API documentation.

### Docker

```bash
# Build and run with Docker Compose
cd docker
docker-compose up --build
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

## Configuration

Environment variables for the server:

- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `DATABASE_URL` - Database connection string (default: ./fortress.db)
- `BASE_URL` - Public base URL used in emailed links
- `COOKIE_SECURE` - Enable secure cookies (default: true in production)
- `COOKIE_SAMESITE` - Cookie SameSite mode (`strict` by default)
- `COOKIE_DOMAIN` - Domain for session cookie (optional, for custom domains)
- `LOG_LEVEL` - Logging level (default: info)
- `REDIS_URL` - Redis URL for rate limiter (falls back to in-memory)
- `METRICS_ENABLED` - Enable `/metrics` endpoint (default: true)

## Architecture

FortressAuth follows hexagonal architecture principles:

- **Core**: Contains all business logic with zero infrastructure dependencies
- **Ports**: Interfaces that define contracts for external services
- **Adapters**: Implementations of ports for specific technologies

## License

MIT

## SDKs & Examples

- React SDK: `@fortressauth/react-sdk` (AuthProvider + hooks)
- Vue SDK: `@fortressauth/vue-sdk` (AuthProvider + composables)
- Examples: `examples/web-react` and `examples/web-vue` (Vite, ready for Vercel deploy via `vercel.json`)