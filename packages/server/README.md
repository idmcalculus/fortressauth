# @fortressauth/server

Standalone HTTP server for FortressAuth with REST API and OpenAPI documentation.

## Features

- 🚀 **Ready to Deploy**: Docker support included
- 📚 **OpenAPI Documentation**: Interactive API docs with Scalar
- 🔒 **Secure Defaults**: HTTPS, secure cookies, CORS configured
- 🎯 **Type-Safe**: Built with Hono and Zod
- 📊 **Health Checks**: Built-in health endpoint

## Quick Start

### Using Docker

```bash
docker-compose up
```

The server will be available at `http://localhost:3000`

### Local Development

```bash
pnpm install
pnpm build
pnpm start
```

## Environment Variables

```bash
PORT=3000                          # Server port
HOST=0.0.0.0                       # Server host
DATABASE_URL=./fortress.db         # SQLite database path
COOKIE_SECURE=false                # Use secure cookies (true in production)
LOG_LEVEL=info                     # Logging level
```

## API Endpoints

### Authentication

**POST /auth/signup**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**POST /auth/login**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**POST /auth/logout**
Requires session cookie.

**GET /auth/me**
Returns current user. Requires session cookie.

### Documentation

**GET /docs**
Interactive API documentation (Scalar UI)

**GET /openapi.json**
OpenAPI 3.1 specification

### Health

**GET /health**
```json
{
  "status": "ok",
  "version": "0.1.4",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Deployment

### Docker

Build and run with Docker:

```bash
docker build -f docker/Dockerfile -t fortressauth .
docker run -p 3000:3000 -v $(pwd)/data:/data fortressauth
```

### Docker Compose

```bash
docker-compose -f docker/docker-compose.yml up -d
```

### Production Considerations

1. **Database**: Use PostgreSQL or MySQL for production
2. **Environment**: Set `COOKIE_SECURE=true` and `NODE_ENV=production`
3. **Reverse Proxy**: Use nginx or similar for HTTPS termination
4. **Monitoring**: Add health check monitoring
5. **Backups**: Regular database backups
6. **Secrets**: Use environment variables or secret management

## Configuration

The server uses sensible defaults but can be customized via environment variables or by modifying the source code.

Default configuration:
- Session TTL: 7 days
- Password: 8-128 characters
- Rate limiting: 5 login attempts per 15 minutes
- Account lockout: 5 failed attempts, 15 minute lockout

## License

MIT
