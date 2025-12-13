import { type Database, SqlAdapter, up } from '@fortressauth/adapter-sql';
import {
  FortressAuth,
  FortressConfigSchema,
  MemoryRateLimiter,
  type FortressConfigInput,
  type RateLimiterPort,
} from '@fortressauth/core';
import Database_ from 'better-sqlite3';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { Redis } from 'ioredis';
import { Kysely, PostgresDialect, SqliteDialect } from 'kysely';
import { Pool } from 'pg';
import { collectDefaultMetrics, register as metricsRegistry } from 'prom-client';
import { env } from './env.js';
import { ConsoleEmailProvider } from './email-provider.js';
import { generateOpenAPIDocument } from './openapi.js';
import { RedisRateLimiter } from './rate-limiters/redis-rate-limiter.js';

const VERSION = '0.1.8';

if (env.METRICS_ENABLED) {
  collectDefaultMetrics({ register: metricsRegistry, prefix: 'fortress_' });
}

// Initialize database with proper typing and dialect
type DatabaseContext = { db: Kysely<Database>; dialect: 'sqlite' | 'postgres'; close: () => Promise<void> };

function createDatabase(): DatabaseContext {
  const url = env.DATABASE_URL;
  const isPostgres = url.startsWith('postgres://') || url.startsWith('postgresql://');

  if (isPostgres) {
    const pool = new Pool({ connectionString: url });
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    return {
      db,
      dialect: 'postgres',
      close: () => pool.end(),
    };
  }

  const sqlite = new Database_(url);
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  return {
    db,
    dialect: 'sqlite',
    close: async () => {
      sqlite.close();
    },
  };
}

const { db, dialect, close } = createDatabase();

// Run migrations with error handling
try {
  await up(db);
} catch (error) {
  console.error('Failed to run database migrations:', error);
  process.exit(1);
}

const fortressConfigInput: FortressConfigInput = {
  session: {
    cookieSecure: env.COOKIE_SECURE,
    cookieSameSite: env.COOKIE_SAMESITE,
    cookieDomain: env.COOKIE_DOMAIN,
  },
  rateLimit: {
    backend: env.REDIS_URL ? 'redis' : 'memory',
  },
  urls: {
    baseUrl: env.BASE_URL,
  },
};

const resolvedConfig = FortressConfigSchema.parse(fortressConfigInput);

// Initialize rate limiter
let redisClient: Redis | null = null;
let rateLimiter: RateLimiterPort;
if (resolvedConfig.rateLimit.backend === 'redis' && env.REDIS_URL) {
  redisClient = new Redis(env.REDIS_URL);
  rateLimiter = new RedisRateLimiter(redisClient, {
    actions: { login: resolvedConfig.rateLimit.login },
  });
} else {
  rateLimiter = new MemoryRateLimiter({ login: resolvedConfig.rateLimit.login });
}

// Initialize FortressAuth
const repository = new SqlAdapter(db, { dialect });
const emailProvider = new ConsoleEmailProvider();
const fortress = new FortressAuth(repository, rateLimiter, emailProvider, resolvedConfig);

const config = fortress.getConfig();

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', secureHeaders());
const allowedOrigins = env.CORS_ORIGINS ?? [
  new URL(env.BASE_URL).origin,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://0.0.0.0:5173',
  'http://0.0.0.0:5174',
];
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return allowedOrigins[0];
      if (allowedOrigins.includes(origin)) return origin;
      return allowedOrigins[0];
    },
    credentials: true,
  }),
);

// Health check
app.get('/health', async (c) => {
  try {
    await db.selectFrom('users').select(db.fn.countAll().as('count')).executeTakeFirst();
    if (redisClient) {
      await redisClient.ping();
    }
  } catch (error) {
    console.error('Health check error', error);
    return c.json({ status: 'degraded', version: VERSION, timestamp: new Date().toISOString() }, 500);
  }

  return c.json({
    status: 'ok',
    version: VERSION,
    timestamp: new Date().toISOString(),
  });
});

// Prometheus metrics
if (env.METRICS_ENABLED) {
  app.get('/metrics', async (c) => {
    const body = await metricsRegistry.metrics();
    return c.body(body, 200, {
      'Content-Type': metricsRegistry.contentType,
    });
  });
}

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
  const cookieOptions: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
    domain?: string;
    path: string;
    maxAge: number;
  } = {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: getSameSite(),
    path: '/',
    maxAge: Math.floor(config.session.ttlMs / 1000),
  };
  if (config.session.cookieDomain) {
    cookieOptions.domain = config.session.cookieDomain;
  }
  setCookie(c, config.session.cookieName, token, cookieOptions);
}

// Helper to clear session cookie
function clearSessionCookie(c: Parameters<typeof deleteCookie>[0]): void {
  const cookieOptions: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
    domain?: string;
    path: string;
  } = {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: getSameSite(),
    path: '/',
  };
  if (config.session.cookieDomain) {
    cookieOptions.domain = config.session.cookieDomain;
  }
  deleteCookie(c, config.session.cookieName, cookieOptions);
}

// Unified success response helper
function success<T>(data: T) {
  return { success: true, data };
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

    return c.json(
      success({
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt.toISOString(),
        },
      }),
    );
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
            : result.error === 'EMAIL_NOT_VERIFIED'
              ? 403
              : 400;
      return c.json({ success: false, error: result.error }, statusCode);
    }

    const { user, token } = result.data;
    setSessionCookie(c, token);

    return c.json(
      success({
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt.toISOString(),
        },
      }),
    );
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

    return c.json(
      success({
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt.toISOString(),
        },
      }),
    );
  } catch (error) {
    console.error('Me error:', error);
    return c.json({ success: false, error: 'INTERNAL_ERROR' }, 500);
  }
});

app.post('/auth/verify-email', async (c) => {
  try {
    const body = await c.req.json();
    const result = await fortress.verifyEmail(body.token);

    if (!result.success) {
      const status =
        result.error === 'EMAIL_VERIFICATION_EXPIRED'
          ? 410
          : result.error === 'EMAIL_VERIFICATION_INVALID'
            ? 400
            : 400;
      return c.json({ success: false, error: result.error }, status);
    }

    return c.json(success({ verified: true }));
  } catch (error) {
    console.error('Verify email error:', error);
    return c.json({ success: false, error: 'INTERNAL_ERROR' }, 500);
  }
});

app.post('/auth/request-password-reset', async (c) => {
  try {
    const body = await c.req.json();
    const result = await fortress.requestPasswordReset(body.email);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json(success({ requested: true }));
  } catch (error) {
    console.error('Request password reset error:', error);
    return c.json({ success: false, error: 'INTERNAL_ERROR' }, 500);
  }
});

app.post('/auth/reset-password', async (c) => {
  try {
    const body = await c.req.json();
    const result = await fortress.resetPassword({ token: body.token, newPassword: body.newPassword });

    if (!result.success) {
      const status =
        result.error === 'PASSWORD_RESET_EXPIRED'
          ? 410
          : result.error === 'PASSWORD_TOO_WEAK'
            ? 400
            : 400;
      return c.json({ success: false, error: result.error }, status);
    }

    return c.json(success({ reset: true }));
  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({ success: false, error: 'INTERNAL_ERROR' }, 500);
  }
});

// Export app for testing
export { app };

// Graceful shutdown handler
function gracefulShutdown(signal: string): void {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  void close();
  if (redisClient) {
    redisClient.quit().catch((error: Error) => console.error('Error closing Redis', error));
  }
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