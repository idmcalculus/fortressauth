# FortressAuth

A secure-by-default, database-agnostic authentication library built with TypeScript and hexagonal architecture.

## Features

- 🔒 **Secure by Default**: Argon2id password hashing, SHA-256 session tokens, timing-attack prevention
- 🏗️ **Hexagonal Architecture**: Clean separation between business logic and infrastructure
- 🗄️ **Database Agnostic**: Works with PostgreSQL, MySQL, and SQLite via Kysely
- 🚀 **Production Ready**: Rate limiting, account lockout, session management
- 📖 **OpenAPI Documentation**: Auto-generated API docs with Scalar UI
- 🐳 **Docker Ready**: Multi-stage Dockerfile with security best practices

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
- `GET /docs` - API documentation
- `GET /openapi.json` - OpenAPI specification
- `POST /auth/signup` - Create new account
- `POST /auth/login` - Sign in
- `POST /auth/logout` - Sign out
- `GET /auth/me` - Get current user

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
- `COOKIE_SECURE` - Enable secure cookies (default: true in production)
- `LOG_LEVEL` - Logging level (default: info)

## Architecture

FortressAuth follows hexagonal architecture principles:

- **Core**: Contains all business logic with zero infrastructure dependencies
- **Ports**: Interfaces that define contracts for external services
- **Adapters**: Implementations of ports for specific technologies

## License

MIT
