import { type Database, SqlAdapter, up } from '@fortressauth/adapter-sql';
import { FortressAuth, MemoryRateLimiter } from '@fortressauth/core';
import Database_ from 'better-sqlite3';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { Kysely, SqliteDialect } from 'kysely';
import { env } from './env.js';
import { generateOpenAPIDocument } from './openapi.js';

const VERSION = '0.1.5';

// Initialize database with proper typing
const sqlite = new Database_(env.DATABASE_URL);
const db = new Kysely<Database>({
  dialect: new SqliteDialect({
    database: sqlite,
  }),
});

// Run migrations with error handling
try {
  await up(db);
} catch (error) {
  console.error('Failed to run database migrations:', error);
  process.exit(1);
}

// Initialize FortressAuth
const repository = new SqlAdapter(db, { dialect: 'sqlite' });
const rateLimiter = new MemoryRateLimiter();
const fortress = new FortressAuth(repository, rateLimiter, {
  session: {
    cookieSecure: env.COOKIE_SECURE,
  },
});

const config = fortress.getConfig();

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', secureHeaders());
app.use(
  '*',
  cors({
    // When credentials are true, origin cannot be '*' per CORS spec
    // In production, this should be configured via environment variable
    origin: env.COOKIE_SECURE ? (origin) => origin : '*',
    credentials: env.COOKIE_SECURE,
  }),
);

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: VERSION,
    timestamp: new Date().toISOString(),
  });
});

// OpenAPI spec
app.get('/openapi.json', (c) => {
  return c.json(generateOpenAPIDocument(VERSION));
});

// API documentation - serve simple HTML that loads Scalar
app.get('/docs', (c) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>FortressAuth API Documentation</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
  return c.html(html);
});

// Helper to get sameSite value for cookies
function getSameSite(): 'Strict' | 'Lax' | 'None' {
  switch (config.session.cookieSameSite) {
    case 'strict':
      return 'Strict';
    case 'none':
      return 'None';
    default:
      return 'Lax';
  }
}

// Helper to set session cookie
function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string): void {
  setCookie(c, config.session.cookieName, token, {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: getSameSite(),
    path: '/',
    maxAge: Math.floor(config.session.ttlMs / 1000),
  });
}

// Helper to clear session cookie
function clearSessionCookie(c: Parameters<typeof deleteCookie>[0]): void {
  deleteCookie(c, config.session.cookieName, {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: getSameSite(),
    path: '/',
  });
}

// Auth routes
app.post('/auth/signup', async (c) => {
  try {
    const body = await c.req.json();
    const ipAddress = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    const userAgent = c.req.header('user-agent');

    const result = await fortress.signUp({
      email: body.email,
      password: body.password,
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
    });

    if (!result.success) {
      const statusCode = result.error === 'RATE_LIMIT_EXCEEDED' ? 429 : 400;
      return c.json({ success: false, error: result.error }, statusCode);
    }

    const { user, token } = result.data;
    setSessionCookie(c, token);

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return c.json({ success: false, error: 'INTERNAL_ERROR' }, 500);
  }
});

app.post('/auth/login', async (c) => {
  try {
    const body = await c.req.json();
    const ipAddress = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    const userAgent = c.req.header('user-agent');

    const result = await fortress.signIn({
      email: body.email,
      password: body.password,
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
    });

    if (!result.success) {
      const statusCode =
        result.error === 'RATE_LIMIT_EXCEEDED'
          ? 429
          : result.error === 'INVALID_CREDENTIALS' || result.error === 'ACCOUNT_LOCKED'
            ? 401
            : 400;
      return c.json({ success: false, error: result.error }, statusCode);
    }

    const { user, token } = result.data;
    setSessionCookie(c, token);

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ success: false, error: 'INTERNAL_ERROR' }, 500);
  }
});

app.post('/auth/logout', async (c) => {
  try {
    const token = getCookie(c, config.session.cookieName);

    if (token) {
      await fortress.signOut(token);
    }

    clearSessionCookie(c);
    return c.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ success: false, error: 'INTERNAL_ERROR' }, 500);
  }
});

app.get('/auth/me', async (c) => {
  try {
    const token = getCookie(c, config.session.cookieName);

    if (!token) {
      return c.json({ success: false, error: 'SESSION_INVALID' }, 401);
    }

    const result = await fortress.validateSession(token);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 401);
    }

    const { user } = result.data;

    // Consistent response format with success wrapper
    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Me error:', error);
    return c.json({ success: false, error: 'INTERNAL_ERROR' }, 500);
  }
});

// Export app for testing
export { app };

// Graceful shutdown handler
function gracefulShutdown(signal: string): void {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  sqlite.close();
  console.log('Database connection closed.');
  process.exit(0);
}

// Start server if running as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  // Register shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  console.log(`🚀 FortressAuth server v${VERSION} starting...`);
  console.log(`📊 Database: ${env.DATABASE_URL}`);
  console.log(`🌐 Server: http://${env.HOST}:${env.PORT}`);
  console.log(`📖 API Docs: http://${env.HOST}:${env.PORT}/docs`);

  const server = { port: env.PORT, hostname: env.HOST } as const;

  // Use @hono/node-server for Node.js runtime
  import('@hono/node-server').then(({ serve }) => {
    serve({
      fetch: app.fetch,
      port: server.port,
      hostname: server.hostname,
    });
  });
}
