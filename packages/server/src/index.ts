import { randomBytes, timingSafeEqual } from 'node:crypto';
import { type Database, SqlAdapter, up } from '@fortressauth/adapter-sql';
import {
  type AuthErrorCode,
  FortressAuth,
  type FortressConfigInput,
  FortressConfigSchema,
  MemoryRateLimiter,
  type RateLimiterPort,
} from '@fortressauth/core';
import Database_ from 'better-sqlite3';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { Redis } from 'ioredis';
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect } from 'kysely';
import { createPool } from 'mysql2';
import { Pool } from 'pg';
import { collectDefaultMetrics, register as metricsRegistry } from 'prom-client';
import { createEmailProvider } from './email-provider.js';
import { env } from './env.js';
import { ErrorResponseFactory } from './errors/error-response-factory.js';
import { generateOpenAPIDocument } from './openapi.js';
import { RedisRateLimiter } from './rate-limiters/redis-rate-limiter.js';

const VERSION = '0.1.9';

// Initialize error response factory based on NODE_ENV
const errorFactory = new ErrorResponseFactory();

if (env.METRICS_ENABLED) {
  collectDefaultMetrics({ register: metricsRegistry, prefix: 'fortress_' });
}

// Initialize database with proper typing and dialect
type DatabaseContext = {
  db: Kysely<Database>;
  dialect: 'sqlite' | 'postgres' | 'mysql';
  close: () => Promise<void>;
};

function createDatabase(): DatabaseContext {
  const url = env.DATABASE_URL;
  const isPostgres = url.startsWith('postgres://') || url.startsWith('postgresql://');
  const isMysql = url.startsWith('mysql://') || url.startsWith('mysql2://');

  if (isPostgres) {
    const pool = new Pool({ connectionString: url });
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    return {
      db,
      dialect: 'postgres',
      close: () => pool.end(),
    };
  }

  if (isMysql) {
    const pool = createPool(url);
    const db = new Kysely<Database>({ dialect: new MysqlDialect({ pool }) });
    return {
      db,
      dialect: 'mysql',
      close: async () => {
        await new Promise<void>((resolve, reject) =>
          pool.end((error) => (error ? reject(error) : resolve())),
        );
      },
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
  await up(db, { dialect });
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
  password: {
    breachedCheck: {
      enabled: env.BREACHED_PASSWORD_CHECK,
      apiUrl: env.BREACHED_PASSWORD_API_URL,
      timeoutMs: env.BREACHED_PASSWORD_TIMEOUT_MS,
    },
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
    actions: {
      login: resolvedConfig.rateLimit.login,
      signup: resolvedConfig.rateLimit.signup,
      passwordReset: resolvedConfig.rateLimit.passwordReset,
      verifyEmail: resolvedConfig.rateLimit.verifyEmail,
    },
  });
} else {
  rateLimiter = new MemoryRateLimiter({
    login: resolvedConfig.rateLimit.login,
    signup: resolvedConfig.rateLimit.signup,
    passwordReset: resolvedConfig.rateLimit.passwordReset,
    verifyEmail: resolvedConfig.rateLimit.verifyEmail,
  });
}

// Initialize FortressAuth
const repository = new SqlAdapter(db, { dialect });
const sesCredentials =
  env.SES_ACCESS_KEY_ID && env.SES_SECRET_ACCESS_KEY
    ? {
        accessKeyId: env.SES_ACCESS_KEY_ID,
        secretAccessKey: env.SES_SECRET_ACCESS_KEY,
        ...(env.SES_SESSION_TOKEN ? { sessionToken: env.SES_SESSION_TOKEN } : {}),
      }
    : undefined;
const smtpAuth =
  env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined;
const smtpTls =
  env.SMTP_TLS_REJECT_UNAUTHORIZED !== undefined || env.SMTP_TLS_SERVERNAME
    ? {
        ...(env.SMTP_TLS_REJECT_UNAUTHORIZED !== undefined
          ? { rejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED }
          : {}),
        ...(env.SMTP_TLS_SERVERNAME ? { servername: env.SMTP_TLS_SERVERNAME } : {}),
      }
    : undefined;
const emailProvider = createEmailProvider({
  provider: env.EMAIL_PROVIDER,
  resend:
    env.RESEND_API_KEY && env.EMAIL_FROM_ADDRESS
      ? {
          apiKey: env.RESEND_API_KEY,
          fromEmail: env.EMAIL_FROM_ADDRESS,
          fromName: env.EMAIL_FROM_NAME,
        }
      : undefined,
  ses:
    env.SES_REGION && env.SES_FROM_ADDRESS
      ? {
          region: env.SES_REGION,
          fromEmail: env.SES_FROM_ADDRESS,
          ...(env.SES_FROM_NAME ? { fromName: env.SES_FROM_NAME } : {}),
          ...(sesCredentials ? { credentials: sesCredentials } : {}),
        }
      : undefined,
  sendgrid:
    env.SENDGRID_API_KEY && env.SENDGRID_FROM_ADDRESS
      ? {
          apiKey: env.SENDGRID_API_KEY,
          fromEmail: env.SENDGRID_FROM_ADDRESS,
          fromName: env.SENDGRID_FROM_NAME,
        }
      : undefined,
  smtp:
    env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM_ADDRESS
      ? {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          ...(smtpAuth ? { auth: smtpAuth } : {}),
          ...(smtpTls ? { tls: smtpTls } : {}),
          fromEmail: env.SMTP_FROM_ADDRESS,
          ...(env.SMTP_FROM_NAME ? { fromName: env.SMTP_FROM_NAME } : {}),
        }
      : undefined,
});
const fortress = new FortressAuth(repository, rateLimiter, emailProvider, resolvedConfig);

const config = fortress.getConfig();

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());
// Configure security headers - allow iframe embedding for docs from localhost
app.use(
  '*',
  secureHeaders({
    xFrameOptions: false, // Disable X-Frame-Options to allow embedding in iframe
    contentSecurityPolicy: {
      frameAncestors: ["'self'", 'http://localhost:*', 'http://0.0.0.0:*'],
    },
  }),
);
const allowedOrigins = env.CORS_ORIGINS ?? [
  new URL(env.BASE_URL).origin,
  'http://localhost:3000',
  'http://localhost:3001',
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

app.use('/auth/*', async (c, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(c.req.method)) {
    const headerToken = c.req.header(env.CSRF_HEADER_NAME);
    const cookieToken = getCookie(c, env.CSRF_COOKIE_NAME);
    if (!headerToken || !cookieToken || !isValidCsrfToken(headerToken, cookieToken)) {
      const { response, status } = createError(
        'CSRF_TOKEN_INVALID',
        'Missing or invalid CSRF token',
      );
      return c.json(response, status);
    }
  }
  return next();
});

// Health check
app.get('/health', async (c) => {
  try {
    await db.selectFrom('users').select(db.fn.countAll().as('count')).executeTakeFirst();
    if (redisClient) {
      await redisClient.ping();
    }
  } catch (error) {
    console.error('Health check error', error);
    return c.json(
      { status: 'degraded', version: VERSION, timestamp: new Date().toISOString() },
      500,
    );
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

function getCsrfSameSite(): 'Strict' | 'Lax' | 'None' {
  switch (env.CSRF_COOKIE_SAMESITE) {
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

function setCsrfCookie(c: Parameters<typeof setCookie>[0], token: string): void {
  const cookieOptions: {
    httpOnly: false;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
    domain?: string;
    path: string;
    maxAge: number;
  } = {
    httpOnly: false,
    secure: env.CSRF_COOKIE_SECURE,
    sameSite: getCsrfSameSite(),
    path: '/',
    maxAge: Math.floor(env.CSRF_TOKEN_TTL_MS / 1000),
  };
  const domain = env.CSRF_COOKIE_DOMAIN ?? config.session.cookieDomain;
  if (domain) {
    cookieOptions.domain = domain;
  }
  setCookie(c, env.CSRF_COOKIE_NAME, token, cookieOptions);
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

function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

function isValidCsrfToken(headerToken: string, cookieToken: string): boolean {
  const headerBuffer = Buffer.from(headerToken);
  const cookieBuffer = Buffer.from(cookieToken);
  if (headerBuffer.length !== cookieBuffer.length) {
    return false;
  }
  return timingSafeEqual(headerBuffer, cookieBuffer);
}

// Unified success response helper
function success<T>(data: T) {
  return { success: true, data };
}

// Unified error response helper using ErrorResponseFactory
function createError(errorCode: AuthErrorCode, details?: string, error?: Error) {
  return {
    response: errorFactory.createErrorResponse(errorCode, details, error),
    status: errorFactory.getHttpStatus(errorCode) as 400 | 401 | 403 | 410 | 429 | 500,
  };
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
      const { response, status } = createError(result.error, `Signup failed for ${body.email}`);
      return c.json(response, status);
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
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Unexpected error during signup',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
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
      const { response, status } = createError(result.error, `Login failed for ${body.email}`);
      return c.json(response, status);
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
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Unexpected error during login',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
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
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Unexpected error during logout',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
  }
});

app.get('/auth/me', async (c) => {
  try {
    const token = getCookie(c, config.session.cookieName);

    if (!token) {
      const { response, status } = createError('SESSION_INVALID', 'No session token provided');
      return c.json(response, status);
    }

    const result = await fortress.validateSession(token);

    if (!result.success) {
      const { response, status } = createError(result.error, 'Session validation failed');
      return c.json(response, status);
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
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Unexpected error fetching user',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
  }
});

app.get('/auth/csrf', (c) => {
  const token = generateCsrfToken();
  setCsrfCookie(c, token);
  return c.json(success({ csrfToken: token }));
});

app.post('/auth/verify-email', async (c) => {
  try {
    const body = await c.req.json();
    const ipAddress = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    const userAgent = c.req.header('user-agent');
    const result = await fortress.verifyEmail(body.token, {
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
    });

    if (!result.success) {
      const { response, status } = createError(result.error, 'Email verification failed');
      return c.json(response, status);
    }

    return c.json(success({ verified: true }));
  } catch (error) {
    console.error('Verify email error:', error);
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Unexpected error during email verification',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
  }
});

app.post('/auth/request-password-reset', async (c) => {
  try {
    const body = await c.req.json();
    const result = await fortress.requestPasswordReset(body.email);

    if (!result.success) {
      const { response, status } = createError(result.error, 'Password reset request failed');
      return c.json(response, status);
    }

    return c.json(success({ requested: true }));
  } catch (error) {
    console.error('Request password reset error:', error);
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Unexpected error during password reset request',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
  }
});

app.post('/auth/reset-password', async (c) => {
  try {
    const body = await c.req.json();
    const ipAddress = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    const userAgent = c.req.header('user-agent');
    const result = await fortress.resetPassword({
      token: body.token,
      newPassword: body.newPassword,
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
    });

    if (!result.success) {
      const { response, status } = createError(result.error, 'Password reset failed');
      return c.json(response, status);
    }

    return c.json(success({ reset: true }));
  } catch (error) {
    console.error('Reset password error:', error);
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Unexpected error during password reset',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
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

// Utility to check if a port is available
async function isPortAvailable(port: number, hostname: string): Promise<boolean> {
  return new Promise((resolve) => {
    import('node:net').then(({ createServer }) => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, hostname);
    });
  });
}

// Find an available port starting from the given port
async function findAvailablePort(startPort: number, hostname: string): Promise<number> {
  let port = startPort;
  const maxAttempts = 10;

  for (let i = 0; i < maxAttempts; i++) {
    if (await isPortAvailable(port, hostname)) {
      return port;
    }
    console.log(`⚠ Port ${port} is in use, trying ${port + 1}...`);
    port++;
  }

  throw new Error(
    `Could not find an available port after ${maxAttempts} attempts starting from ${startPort}`,
  );
}

// Start server if running as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  // Register shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  console.log(`🚀 FortressAuth server v${VERSION} starting...`);
  console.log(`📊 Database: ${env.DATABASE_URL}`);

  // Find available port
  findAvailablePort(env.PORT, env.HOST)
    .then((availablePort) => {
      if (availablePort !== env.PORT) {
        console.log(
          `⚠ Port ${env.PORT} is in use by another process, using available port ${availablePort} instead.`,
        );
      }

      console.log(`🌐 Server: http://${env.HOST}:${availablePort}`);
      console.log(`📖 API Docs: http://${env.HOST}:${availablePort}/docs`);

      // Use @hono/node-server for Node.js runtime
      import('@hono/node-server').then(({ serve }) => {
        serve({
          fetch: app.fetch,
          port: availablePort,
          hostname: env.HOST,
        });
      });
    })
    .catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}
