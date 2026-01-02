# @fortressauth/server

Standalone HTTP server for FortressAuth with REST API and OpenAPI documentation.

## Features

- Ready to Deploy: Docker support included
- OpenAPI Documentation: Interactive API docs with Scalar
- Secure Defaults: HTTPS, secure cookies, CORS configured
- Type-Safe: Built with Hono and Zod
- Health Checks: Built-in health endpoint
- Pluggable Email: Console (dev) or Resend (production)

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
DATABASE_URL=./fortress.db         # SQLite database path (or PostgreSQL URL)
BASE_URL=http://localhost:3000     # Public URL for email links
COOKIE_SECURE=false                # Use secure cookies (true in production)
COOKIE_SAMESITE=strict             # Cookie SameSite attribute
LOG_LEVEL=info                     # Logging level
CORS_ORIGINS=                      # Comma-separated allowed origins (see CORS section below)

# Email Provider Configuration
EMAIL_PROVIDER=console             # 'console' (dev) or 'resend' (production)
RESEND_API_KEY=                    # Required when EMAIL_PROVIDER=resend
EMAIL_FROM_ADDRESS=                # Sender email (e.g., noreply@yourdomain.com)
EMAIL_FROM_NAME=                   # Sender name (e.g., "My App")
```

## CORS Configuration

FortressAuth server supports Cross-Origin Resource Sharing (CORS) for web applications running on different origins.

### Default Origins

When `CORS_ORIGINS` is not set, the server allows requests from these default origins:
- The server's own origin (derived from `BASE_URL`)
- `http://localhost:3000`
- `http://localhost:3001`
- `http://localhost:5173` (Vite default)
- `http://localhost:5174`
- `http://0.0.0.0:5173`
- `http://0.0.0.0:5174`

### Custom Origins

Set `CORS_ORIGINS` to a comma-separated list of allowed origins:

```bash
# Single origin
CORS_ORIGINS=https://myapp.com

# Multiple origins
CORS_ORIGINS=https://myapp.com,https://admin.myapp.com,http://localhost:3000

# Development with multiple ports
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:4200
```

### Credentials Support

The server is configured with `credentials: true`, which means:
- Cookies are sent with cross-origin requests
- The `Access-Control-Allow-Credentials` header is set to `true`
- Client applications must use `credentials: 'include'` in fetch requests

### Client SDK Configuration

All FortressAuth web SDKs (React, Vue, Svelte, Angular) automatically include `credentials: 'include'` in their fetch requests. No additional configuration is needed.

For custom implementations, ensure your fetch calls include credentials:

```typescript
// Correct - credentials included
fetch('http://localhost:3000/auth/me', {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
});

// Incorrect - cookies won't be sent
fetch('http://localhost:3000/auth/me', {
  headers: { 'Content-Type': 'application/json' }
});
```

### Mobile/Desktop Applications

Electron and React Native/Expo SDKs use Bearer token authentication instead of cookies, so CORS cookie handling doesn't apply. These SDKs store tokens securely using:
- **Electron**: electron-store (encrypted local storage)
- **Expo**: expo-secure-store (encrypted secure storage)
- **React Native**: AsyncStorage (with optional secure storage)

### Production Configuration

For production deployments:

```bash
# Production example
CORS_ORIGINS=https://myapp.com,https://www.myapp.com
COOKIE_SECURE=true
COOKIE_SAMESITE=strict
```

**Important**: In production, always:
1. Set `COOKIE_SECURE=true` (requires HTTPS)
2. Use `COOKIE_SAMESITE=strict` or `lax` for CSRF protection
3. Only allow specific origins (avoid wildcards)

## Email Providers

FortressAuth supports pluggable email providers for maximum flexibility.

### Console Provider (Default)

Logs emails to console. Perfect for local development:

```bash
EMAIL_PROVIDER=console
```

### Resend Provider

For production email delivery:

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME="Your App Name"
```

**Setup steps:**
1. Create account at [resend.com](https://resend.com)
2. Add and verify your domain
3. Create an API key
4. Set the environment variables above

### Custom Providers

Implement the `EmailProviderPort` interface from `@fortressauth/core`:

```typescript
import type { EmailProviderPort } from '@fortressauth/core';

class MyEmailProvider implements EmailProviderPort {
  async sendVerificationEmail(email: string, verificationLink: string): Promise<void> {
    // Your implementation
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    // Your implementation
  }
}
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
  "version": "0.1.9",
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