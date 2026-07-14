# @fortressauth/server

Standalone HTTP server for FortressAuth with REST API and OpenAPI documentation.

The production API is live at `https://api.fortressauth.com`, with OpenAPI JSON
at `https://api.fortressauth.com/openapi.json` and interactive docs at
`https://api.fortressauth.com/docs`.

## Features

- Ready to Deploy: Docker support included
- OpenAPI Documentation: Interactive API docs with Scalar
- Secure Defaults: HTTPS, secure cookies, CORS configured
- Type-Safe: Built with Hono and Zod
- Health Checks: Built-in health endpoint
- Pluggable Email: Console, Resend, SES, SendGrid, SMTP, or custom

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

By default the server will walk to the next free port if `PORT` is already occupied. Set `STRICT_PORT=true` when an external orchestrator has already chosen the port and every other local service must keep using that exact value.

## Environment Variables

```bash
PORT=3000                          # Server port
HOST=0.0.0.0                       # Server host
STRICT_PORT=false                  # Fail instead of auto-selecting another port
DATABASE_URL=./fortress.db         # SQLite database path (or PostgreSQL/MySQL URL)
BASE_URL=http://localhost:3000     # Public URL for email links
COOKIE_SECURE=false                # Use secure cookies (true in production)
COOKIE_SAMESITE=strict             # Cookie SameSite attribute
LOG_LEVEL=info                     # Logging level
CORS_ORIGINS=                      # Comma-separated allowed origins (see CORS section below)
NATIVE_CLIENTS_JSON=[]             # Desktop client IDs and exact redirect URI allowlists
NATIVE_AUTHORIZATION_CODE_TTL_MS=60000
RESOURCE_SERVERS_JSON=[]           # Public audience/client policy
# RESOURCE_SERVER_CREDENTIALS_JSON # Secret-manager injection only; never app/public config
RESOURCE_INTROSPECTION_GLOBAL_MAX_TOKENS=2000
RESOURCE_INTROSPECTION_GLOBAL_WINDOW_MS=60000
RESOURCE_INTROSPECTION_MAX_BODY_BYTES=1024
RESOURCE_INTROSPECTION_AUDIT_RETENTION_DAYS=90

# Email Provider Configuration
EMAIL_PROVIDER=console             # 'console', 'resend', 'ses', 'sendgrid', 'smtp'
RESEND_API_KEY=                    # Required when EMAIL_PROVIDER=resend
EMAIL_FROM_ADDRESS=                # Sender email (e.g., noreply@yourdomain.com)
EMAIL_FROM_NAME=                   # Sender name (e.g., "My App")
SES_REGION=                        # Required when EMAIL_PROVIDER=ses
SES_ACCESS_KEY_ID=                 # Required when EMAIL_PROVIDER=ses
SES_SECRET_ACCESS_KEY=             # Required when EMAIL_PROVIDER=ses
SES_SESSION_TOKEN=                 # Optional when EMAIL_PROVIDER=ses
SES_FROM_ADDRESS=                  # Required when EMAIL_PROVIDER=ses
SES_FROM_NAME=                     # Optional when EMAIL_PROVIDER=ses
SENDGRID_API_KEY=                  # Required when EMAIL_PROVIDER=sendgrid
SENDGRID_FROM_ADDRESS=             # Required when EMAIL_PROVIDER=sendgrid
SENDGRID_FROM_NAME=                # Optional when EMAIL_PROVIDER=sendgrid
SMTP_HOST=                         # Required when EMAIL_PROVIDER=smtp
SMTP_PORT=                         # Required when EMAIL_PROVIDER=smtp
SMTP_SECURE=false                  # Optional when EMAIL_PROVIDER=smtp
SMTP_USER=                         # Optional when EMAIL_PROVIDER=smtp
SMTP_PASS=                         # Optional when EMAIL_PROVIDER=smtp
SMTP_FROM_ADDRESS=                 # Required when EMAIL_PROVIDER=smtp
SMTP_FROM_NAME=                    # Optional when EMAIL_PROVIDER=smtp
SMTP_TLS_REJECT_UNAUTHORIZED=      # Optional when EMAIL_PROVIDER=smtp
SMTP_TLS_SERVERNAME=               # Optional when EMAIL_PROVIDER=smtp
```

## Database Setup

### PostgreSQL

Connection string example:

```bash
postgresql://user:password@localhost:5432/fortressauth
```

Required permissions for the database user:

- CREATE, ALTER, DROP tables
- CREATE, DROP indexes
- SELECT, INSERT, UPDATE, DELETE

### MySQL

Connection string example:

```bash
mysql://user:password@localhost:3306/fortressauth
```

Required permissions for the database user:

- CREATE, ALTER, DROP tables
- CREATE, DROP indexes
- SELECT, INSERT, UPDATE, DELETE

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

### Native desktop applications

`@fortressauth/desktop-sdk` provides a framework-neutral flow for Tauri, Electron, and other desktop runtimes. It uses the external system browser, OAuth provider login, PKCE S256, client state validation, a short-lived single-use authorization code, and a bearer session token. Browser cookie sessions and double-submit CSRF remain separate and unchanged.

Register any number of desktop applications with independent exact redirect URI and resource
audience allowlists. An omitted `resourceAudiences` property grants no resource access:

```bash
NATIVE_CLIENTS_JSON='[
  {"clientId":"tauri-app","redirectUris":["tauri-app://auth/callback"],"resourceAudiences":["account-api"]},
  {"clientId":"electron-app","redirectUris":["electron-app://auth/callback"]}
]'
RESOURCE_SERVERS_JSON='[
  {"audience":"account-api","enabled":true,"allowedClientIds":["tauri-app"]}
]'
NATIVE_AUTHORIZATION_CODE_TTL_MS=60000
NATIVE_SESSION_TTL_MS=86400000
```

The current Wraith launch contract is OAuth-only. Configure at least one supported provider such as Google or Apple and expose only those configured provider choices in Wraith. FortressAuth email/password signup and signin are not desktop SDK flows yet; supporting them requires a hosted FortressAuth browser UI that returns through the same one-time native authorization-code handoff. Wraith must not collect those credentials directly or imply that the current SDK supports them.

The native sequence is:

1. The client generates a high-entropy state and PKCE verifier/challenge.
2. It opens `GET /auth/native/authorize/:provider` in the system browser with `client_id`, the exact `redirect_uri`, `state`, `code_challenge`, `code_challenge_method=S256`, and optional registered `audience` and `max_age`.
3. After provider authentication, FortressAuth redirects to the registered URI with only `code` and `state`. Cancellation and post-state provider failures return a server-controlled `error`, generic `error_description`, and the original desktop `state`. All return targets come exclusively from the consumed server-side OAuth state. No session token or provider detail is put in the URL.
4. The client validates state and calls `POST /auth/native/token` with the code, original redirect URI, client ID, and verifier.
5. The returned split session token is used with `Authorization: Bearer` on `GET /auth/native/session` and `POST /auth/native/logout`.

The SDK requires injected storage. Production desktop apps must use an OS keychain or equivalent protected credential store; do not use plain files, local storage, a fixed application encryption key, or the test-only in-memory adapter. Never log callback URLs, authorization codes, PKCE verifiers, or session tokens.

The TypeScript SDK keeps the token in the JavaScript process that owns the client. Electron should
create it in the main/utility process. A Tauri application that requires Rust-owned credentials
must implement the same protocol in a Rust controller and expose only narrow commands/redacted
state to the WebView; a renderer-callable HTTP plugin does not satisfy that boundary.

Native bearer sessions have their own configurable TTL (`NATIVE_SESSION_TTL_MS`, 24 hours by default) and the token exchange returns `expiresAt`. This release deliberately has no background refresh token: local expiry, server-side revocation, or logout forces a new system-browser OAuth authorization. Browser cookie sessions retain their separate configured TTL and behavior.

#### Resource-server introspection and step-up

`POST /auth/resource/introspect` is an internal HTTPS contract for backend resource servers. It
requires one audience-specific credential in `Authorization: Bearer`, exact
`application/x-www-form-urlencoded`, and exactly `token` plus `audience` form fields. It never
accepts caller-supplied identity claims. Inactive sessions always return `{"active":false}`; active
responses derive `sub`, nullable email snapshot, `email_verified`, `aud`, `client_id`, `exp`, `sid`,
and nullable `auth_time` exclusively from persisted server state. Responses are not cacheable.

Keep `RESOURCE_SERVERS_JSON` public and inject `RESOURCE_SERVER_CREDENTIALS_JSON` only through the
deployment secret manager. Every audience needs its own independently generated secret. Multiple
enabled credential entries permit overlap rotation; verify the new value before disabling the old
one. Startup rejects shared credentials, duplicate ids, unknown audiences, and enabled resources
without credentials.

Clients request an audience or fresh ceremony through `DesktopAuthClient.signIn(provider, {
audience, maxAgeSeconds })`. A provider must explicitly support fresh authentication and return
validated provider evidence; otherwise the request fails closed. The bundled providers do not yet
claim fresh-authentication support. A resource server must reject null, future, or stale `auth_time`
for a sensitive operation.

See the root [`NATIVE_RESOURCE_AUTH.md`](../../NATIVE_RESOURCE_AUTH.md) for the exact HTTP shape,
credential generation/rotation procedure, migration sequence, rate-limit/audit contract, and the
Wraith operator fixture.

### Production Configuration

For production deployments:

```bash
# Shared top-level domain example
BASE_URL=https://fortressauth.com
CORS_ORIGINS=https://fortressauth.com,https://react-demo.fortressauth.com
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
CSRF_COOKIE_SECURE=true
CSRF_COOKIE_SAMESITE=lax
```

**Important**: In production, always:
1. Set `COOKIE_SECURE=true` (requires HTTPS)
2. Use `COOKIE_SAMESITE=lax` and `CSRF_COOKIE_SAMESITE=lax` when the frontend and API share the same top-level domain
3. Use `COOKIE_SAMESITE=none` and `CSRF_COOKIE_SAMESITE=none` when the frontend and API are on different top-level domains
4. Include every browser frontend origin in `CORS_ORIGINS` when demos or apps call the API directly. The production `/demo` page embeds `https://react-demo.fortressauth.com`, so both landing and React demo origins are required. Packaged desktop clients should use a runtime-native Fetch-compatible transport; do not add generic Tauri origins or desktop-app values to this browser CORS list. CORS is not the native-client authorization boundary.
5. Only allow specific origins (avoid wildcards)

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

### AWS SES Provider

```bash
EMAIL_PROVIDER=ses
SES_REGION=us-east-1
SES_ACCESS_KEY_ID=...
SES_SECRET_ACCESS_KEY=...
SES_SESSION_TOKEN=        # optional
SES_FROM_ADDRESS=noreply@yourdomain.com
SES_FROM_NAME="Your App Name"
```

### SendGrid Provider

```bash
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=...
SENDGRID_FROM_ADDRESS=noreply@yourdomain.com
SENDGRID_FROM_NAME="Your App Name"
```

### SMTP Provider

```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM_ADDRESS=noreply@yourdomain.com
SMTP_FROM_NAME="Your App Name"
SMTP_TLS_REJECT_UNAUTHORIZED=false
SMTP_TLS_SERVERNAME=smtp.example.com
```

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
  "version": "0.2.0",
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
