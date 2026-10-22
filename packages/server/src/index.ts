import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { type Database, SqlAdapter, up } from '@fortressauth/adapter-sql';
import type { OAuthProviderId, OAuthProviderPort } from '@fortressauth/core';
import {
  type AuthErrorCode,
  FortressAuth,
  type FortressConfigInput,
  FortressConfigSchema,
  MemoryRateLimiter,
  type RateLimiterPort,
  ResourceIntrospectionAuditEvent,
  Session,
} from '@fortressauth/core';
import { AppleOAuthProvider } from '@fortressauth/provider-apple';
import { DiscordOAuthProvider } from '@fortressauth/provider-discord';
import { GitHubOAuthProvider } from '@fortressauth/provider-github';
import { GoogleOAuthProvider } from '@fortressauth/provider-google';
import { LinkedInOAuthProvider } from '@fortressauth/provider-linkedin';
import { MicrosoftOAuthProvider } from '@fortressauth/provider-microsoft';
import { TwitterOAuthProvider } from '@fortressauth/provider-twitter';
import { getConnInfo } from '@hono/node-server/conninfo';
import Database_ from 'better-sqlite3';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { Redis } from 'ioredis';
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect } from 'kysely';
import { createPool } from 'mysql2';
import { Pool, type PoolConfig } from 'pg';
import { collectDefaultMetrics, register as metricsRegistry } from 'prom-client';
import { z } from 'zod';
import { createEmailProvider } from './email-provider.js';
import { env } from './env.js';
import { ErrorResponseFactory } from './errors/error-response-factory.js';
import { generateOpenAPIDocument } from './openapi.js';
import { RedisRateLimiter } from './rate-limiters/redis-rate-limiter.js';
import { resolveTrustedSourceIdentity } from './security/source-identity.js';

const VERSION = '0.2.0';

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
    const parsedUrl = new URL(url);
    const sslMode = parsedUrl.searchParams.get('sslmode')?.toLowerCase() ?? null;
    // pg replaces the provided `ssl` object when `sslmode` is present in the URL.
    // We normalize by removing `sslmode` and mapping it ourselves.
    if (sslMode) {
      parsedUrl.searchParams.delete('sslmode');
    }

    const poolConfig: PoolConfig = { connectionString: parsedUrl.toString() };

    if (sslMode === 'disable') {
      poolConfig.ssl = false;
    } else if (sslMode === 'verify-ca' || sslMode === 'verify-full') {
      poolConfig.ssl = { rejectUnauthorized: true };
    } else if (sslMode === 'require' || sslMode === 'no-verify') {
      poolConfig.ssl = { rejectUnauthorized: false };
    }

    const pool = new Pool(poolConfig);
    // Without an `error` listener, idle-client errors emitted by node-postgres
    // become uncaughtExceptions and crash the process. Log them instead.
    pool.on('error', (error) => {
      console.error('[pg pool] idle client error', error);
    });
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    return {
      db,
      dialect: 'postgres',
      close: () => pool.end(),
    };
  }

  if (isMysql) {
    const pool = createPool(url);
    // mysql2 pools emit `error` on idle-connection failures; without a listener
    // these crash the process.
    pool.on('error', (error: unknown) => {
      console.error('[mysql pool] idle connection error', error);
    });
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
  oauth: {
    providers: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              redirectUri: env.GOOGLE_REDIRECT_URI,
            },
          }
        : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_REDIRECT_URI
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
              redirectUri: env.GITHUB_REDIRECT_URI,
            },
          }
        : {}),
      ...(env.APPLE_CLIENT_ID &&
      env.APPLE_TEAM_ID &&
      env.APPLE_KEY_ID &&
      env.APPLE_REDIRECT_URI &&
      (env.APPLE_CLIENT_SECRET || env.APPLE_PRIVATE_KEY)
        ? {
            apple: {
              clientId: env.APPLE_CLIENT_ID,
              teamId: env.APPLE_TEAM_ID,
              keyId: env.APPLE_KEY_ID,
              redirectUri: env.APPLE_REDIRECT_URI,
              clientSecret: env.APPLE_CLIENT_SECRET,
              ...(env.APPLE_PRIVATE_KEY ? { privateKey: env.APPLE_PRIVATE_KEY } : {}),
              ...(env.APPLE_CLIENT_SECRET_TTL_SECONDS
                ? { clientSecretExpiresIn: env.APPLE_CLIENT_SECRET_TTL_SECONDS }
                : {}),
            },
          }
        : {}),
      ...(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_REDIRECT_URI
        ? {
            discord: {
              clientId: env.DISCORD_CLIENT_ID,
              clientSecret: env.DISCORD_CLIENT_SECRET,
              redirectUri: env.DISCORD_REDIRECT_URI,
            },
          }
        : {}),
      ...(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET && env.LINKEDIN_REDIRECT_URI
        ? {
            linkedin: {
              clientId: env.LINKEDIN_CLIENT_ID,
              clientSecret: env.LINKEDIN_CLIENT_SECRET,
              redirectUri: env.LINKEDIN_REDIRECT_URI,
            },
          }
        : {}),
      ...(env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET && env.TWITTER_REDIRECT_URI
        ? {
            twitter: {
              clientId: env.TWITTER_CLIENT_ID,
              clientSecret: env.TWITTER_CLIENT_SECRET,
              redirectUri: env.TWITTER_REDIRECT_URI,
            },
          }
        : {}),
      ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_REDIRECT_URI
        ? {
            microsoft: {
              clientId: env.MICROSOFT_CLIENT_ID,
              clientSecret: env.MICROSOFT_CLIENT_SECRET,
              redirectUri: env.MICROSOFT_REDIRECT_URI,
              tenantId: env.MICROSOFT_TENANT_ID,
              scopes: env.MICROSOFT_SCOPES,
            },
          }
        : {}),
    },
  },
  nativeAuth: {
    authorizationCodeTtlMs: env.NATIVE_AUTHORIZATION_CODE_TTL_MS,
    sessionTtlMs: env.NATIVE_SESSION_TTL_MS,
    clients:
      env.NATIVE_CLIENTS_JSON.length > 0
        ? env.NATIVE_CLIENTS_JSON
        : env.NATIVE_CLIENT_ID && env.NATIVE_REDIRECT_URIS.length > 0
          ? [{ clientId: env.NATIVE_CLIENT_ID, redirectUris: env.NATIVE_REDIRECT_URIS }]
          : [],
    resourceServers: env.RESOURCE_SERVERS_JSON,
  },
};

const resolvedConfig = (() => {
  const parsed = FortressConfigSchema.safeParse(fortressConfigInput);
  if (parsed.success) {
    return parsed.data;
  }
  console.error('[fortressauth] Invalid Fortress configuration assembled from env:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
})();

type ResourceAuthenticator = {
  audience: string;
  enabled: boolean;
  verifierHashes: Buffer[];
  rateLimit: { maxTokens: number; windowMs: number };
};

const resourceAuthenticators: ResourceAuthenticator[] = (() => {
  const publicAudiences = new Set(
    resolvedConfig.nativeAuth.resourceServers.map((resource) => resource.audience),
  );
  const configuredAudiences = new Set<string>();
  const credentialIds = new Set<string>();
  const verifierHashes = new Set<string>();
  const authenticators: ResourceAuthenticator[] = [];
  const failures: string[] = [];

  for (const resource of env.RESOURCE_SERVER_CREDENTIALS_JSON) {
    if (configuredAudiences.has(resource.audience)) {
      failures.push(`duplicate credential entry for audience ${resource.audience}`);
      continue;
    }
    configuredAudiences.add(resource.audience);
    if (!publicAudiences.has(resource.audience)) {
      failures.push(`credentials reference unregistered audience ${resource.audience}`);
    }
    const activeHashes: Buffer[] = [];
    for (const credential of resource.credentials) {
      if (credentialIds.has(credential.credentialId)) {
        failures.push(`credential id ${credential.credentialId} must be globally unique`);
      }
      credentialIds.add(credential.credentialId);
      if (verifierHashes.has(credential.verifierHash)) {
        failures.push('resource-server credentials must not be shared');
      }
      verifierHashes.add(credential.verifierHash);
      if (credential.enabled) activeHashes.push(Buffer.from(credential.verifierHash, 'hex'));
    }
    authenticators.push({
      audience: resource.audience,
      enabled:
        resolvedConfig.nativeAuth.resourceServers.find(
          (candidate) => candidate.audience === resource.audience,
        )?.enabled ?? false,
      rateLimit: resolvedConfig.nativeAuth.resourceServers.find(
        (candidate) => candidate.audience === resource.audience,
      )?.rateLimit ?? { maxTokens: 120, windowMs: 60_000 },
      verifierHashes: activeHashes,
    });
  }

  for (const resource of resolvedConfig.nativeAuth.resourceServers) {
    const authenticator = authenticators.find(
      (candidate) => candidate.audience === resource.audience,
    );
    if (resource.enabled && (!authenticator || authenticator.verifierHashes.length === 0)) {
      failures.push(`enabled audience ${resource.audience} requires an active service credential`);
    }
  }

  if (failures.length > 0) {
    console.error('[fortressauth] Invalid resource-server credential configuration:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  return authenticators;
})();

// Initialize rate limiter
let redisClient: Redis | null = null;
let rateLimiter: RateLimiterPort;
if (resolvedConfig.rateLimit.backend === 'redis' && env.REDIS_URL) {
  redisClient = new Redis(env.REDIS_URL, {
    // ioredis retries forever by default. Cap retries during a per-command
    // outage so a Redis blip doesn't pile up unbounded queued commands.
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });
  // Without an `error` listener, ioredis emits `error` events that bubble
  // to the process as unhandled errors and crash the server.
  redisClient.on('error', (error) => {
    console.error('[redis] connection error', error);
  });
  redisClient.on('end', () => {
    console.warn('[redis] connection closed');
  });
  redisClient.on('reconnecting', (delay: number) => {
    console.warn(`[redis] reconnecting in ${delay}ms`);
  });
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

const introspectionActions = Object.fromEntries([
  [
    'resourceIntrospectionGlobal',
    {
      maxTokens: env.RESOURCE_INTROSPECTION_GLOBAL_MAX_TOKENS,
      windowMs: env.RESOURCE_INTROSPECTION_GLOBAL_WINDOW_MS,
      refillRateMs: Math.max(
        1,
        Math.floor(
          env.RESOURCE_INTROSPECTION_GLOBAL_WINDOW_MS /
            env.RESOURCE_INTROSPECTION_GLOBAL_MAX_TOKENS,
        ),
      ),
    },
  ],
  ...resolvedConfig.nativeAuth.resourceServers.map((resource) => [
    `resourceIntrospection:${createHash('sha256').update(resource.audience).digest('hex')}`,
    {
      maxTokens: resource.rateLimit.maxTokens,
      windowMs: resource.rateLimit.windowMs,
      refillRateMs: Math.max(
        1,
        Math.floor(resource.rateLimit.windowMs / resource.rateLimit.maxTokens),
      ),
    },
  ]),
]) as Record<string, { maxTokens: number; refillRateMs: number; windowMs: number }>;

const introspectionRateLimiter = redisClient
  ? new RedisRateLimiter(redisClient, {
      prefix: 'fortress:introspection',
      actions: introspectionActions,
      failureMode: 'closed',
    })
  : new MemoryRateLimiter(introspectionActions);

// Initialize FortressAuth
const repository = new SqlAdapter(db, { dialect });
const auditRetentionMs = env.RESOURCE_INTROSPECTION_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
await repository.pruneResourceIntrospectionAudit(new Date(Date.now() - auditRetentionMs));
const auditRetentionTimer = setInterval(
  () => {
    void repository
      .pruneResourceIntrospectionAudit(new Date(Date.now() - auditRetentionMs))
      .catch(() => console.error('[fortressauth] resource introspection audit pruning failed'));
  },
  60 * 60 * 1000,
);
auditRetentionTimer.unref();
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
          ...(env.SES_CONFIGURATION_SET_NAME
            ? { configurationSetName: env.SES_CONFIGURATION_SET_NAME }
            : {}),
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

// Initialize OAuth Providers
const oauthProviders: Record<string, OAuthProviderPort> = {};
// biome-ignore lint/suspicious/noExplicitAny: OAuth config can be complex due to Zod inference
const oauthConfig = resolvedConfig.oauth.providers as Record<string, any>;

if (oauthConfig?.google) {
  oauthProviders.google = new GoogleOAuthProvider(oauthConfig.google);
}
if (oauthConfig?.github) {
  oauthProviders.github = new GitHubOAuthProvider(oauthConfig.github);
}
if (oauthConfig?.apple) {
  oauthProviders.apple = new AppleOAuthProvider(oauthConfig.apple);
}
if (oauthConfig?.discord) {
  oauthProviders.discord = new DiscordOAuthProvider(oauthConfig.discord);
}
if (oauthConfig?.linkedin) {
  oauthProviders.linkedin = new LinkedInOAuthProvider(oauthConfig.linkedin);
}
if (oauthConfig?.twitter) {
  oauthProviders.twitter = new TwitterOAuthProvider(oauthConfig.twitter);
}
if (oauthConfig?.microsoft) {
  oauthProviders.microsoft = new MicrosoftOAuthProvider(oauthConfig.microsoft);
}

const config = fortress.getConfig();

// Create Hono app
const app = new Hono();

// Middleware
const requestLogger = logger();
app.use('*', (c, next) => {
  // The default logger includes the full query string. Native authorization
  // requests and OAuth callbacks contain state, codes, and PKCE challenges,
  // so logging their URLs would leak short-lived credentials into log sinks.
  if (
    c.req.path === '/auth/resource/introspect' ||
    c.req.path.startsWith('/auth/native/authorize/') ||
    /^\/auth\/oauth\/[^/]+\/callback$/.test(c.req.path)
  ) {
    return next();
  }
  return requestLogger(c, next);
});
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

app.use('/auth/resource/introspect', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
  return next();
});
app.use('/auth/resource/introspect', async (c, next) => {
  const sourceIdentity = getTrustedRateLimitIdentity(c);
  const allowed = await enforceIntrospectionRateLimits([
    { identifier: 'global', action: 'resourceIntrospectionGlobal' },
    {
      identifier: `source:${hashIdentifier(sourceIdentity)}`,
      action: 'resourceIntrospectionGlobal',
    },
  ]);
  if (!allowed) {
    const recorded = await recordRateLimitedAuditOnce(
      'global',
      env.RESOURCE_INTROSPECTION_GLOBAL_WINDOW_MS,
      { sourceIdentity, outcome: 'rate_limited' },
    );
    return c.json({ active: false }, recorded ? 429 : 503);
  }
  return next();
});
app.use(
  '/auth/resource/introspect',
  bodyLimit({
    maxSize: env.RESOURCE_INTROSPECTION_MAX_BODY_BYTES,
    onError: async (c) => {
      const recorded = await recordIntrospectionAudit({
        sourceIdentity: getTrustedRateLimitIdentity(c),
        outcome: 'request_rejected',
      });
      return c.json({ active: false }, recorded ? 413 : 503);
    },
  }),
);

app.use('/auth/*', async (c, next) => {
  if (c.req.method === 'POST' && c.req.path === '/auth/oauth/apple/callback') {
    return next();
  }

  if (
    c.req.method === 'POST' &&
    (c.req.path === '/auth/native/token' ||
      c.req.path === '/auth/native/logout' ||
      c.req.path === '/auth/resource/introspect')
  ) {
    return next();
  }

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
  <script id="api-reference" data-url="../openapi.json"></script>
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

type NativeReturnTarget = { redirectUri: string; state: string };

function redirectNativeOAuthError(
  c: Context,
  target: NativeReturnTarget,
  errorCode: AuthErrorCode,
): Response {
  const redirect = new URL(target.redirectUri);
  redirect.searchParams.set('error', errorCode);
  // This description is intentionally server-controlled. Provider callback
  // descriptions are untrusted and may contain sensitive implementation details.
  redirect.searchParams.set('error_description', 'OAuth authorization did not complete.');
  redirect.searchParams.set('state', target.state);
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
  return c.redirect(redirect.toString());
}

// ---------------------------------------------------------------------------
// Request body schemas
// ---------------------------------------------------------------------------
// We intentionally keep these schemas minimal: the goal is to convert obviously
// malformed input (missing fields, wrong types, non-object body) into a 400
// before it reaches the orchestrator. Domain rules (password strength, email
// format) remain authoritative in `@fortressauth/core/security/validation`.
const credentialsSchema = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(4096),
});

const tokenOnlySchema = z.object({
  token: z.string().min(1).max(256),
});

const requestPasswordResetSchema = z.object({
  email: z.string().min(1).max(320),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  newPassword: z.string().min(1).max(4096),
});

const nativeAuthorizeQuerySchema = z
  .object({
    client_id: z.string().min(1).max(128),
    redirect_uri: z.string().url().max(2_048),
    state: z.string().regex(/^[A-Za-z0-9\-._~]{43,128}$/),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_challenge_method: z.literal('S256'),
    audience: z.string().min(1).max(256).optional(),
    max_age: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 60 * 60)
      .optional(),
  })
  .strict();

const nativeTokenSchema = z
  .object({
    grantType: z.literal('authorization_code'),
    clientId: z.string().min(1).max(128),
    code: z.string().min(1).max(256),
    redirectUri: z.string().url().max(2_048),
    codeVerifier: z.string().regex(/^[A-Za-z0-9\-._~]{43,128}$/),
  })
  .strict();

const introspectionFieldSchema = z.object({
  token: z.string().min(1).max(256),
  audience: z.string().min(1).max(256),
});

function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function authenticateResourceServer(
  authorization: string | undefined,
): ResourceAuthenticator | null {
  const bounded = authorization && authorization.length <= 320 ? authorization : undefined;
  const credential = bounded ? /^Bearer ([A-Za-z0-9_-]{43,256})$/.exec(bounded)?.[1] : undefined;
  const candidateHash = createHash('sha256')
    .update(credential ?? '')
    .digest();
  const dummyHash = createHash('sha256')
    .update('fortressauth-invalid-resource-credential')
    .digest();
  let matched: ResourceAuthenticator | null = null;

  for (const resource of resourceAuthenticators) {
    for (const verifierHash of resource.verifierHashes) {
      const equal = timingSafeEqual(candidateHash, verifierHash);
      if (equal && credential && resource.enabled) matched = resource;
    }
  }
  // Always perform a comparison even when no credentials are configured or the header is missing.
  timingSafeEqual(candidateHash, dummyHash);
  return matched;
}

async function enforceIntrospectionRateLimits(
  entries: Array<{ identifier: string; action: string }>,
): Promise<boolean> {
  return introspectionRateLimiter.reserve(entries);
}

const rateLimitAuditNextAllowedAt = new Map<string, number>();

async function recordRateLimitedAuditOnce(
  scope: string,
  windowMs: number,
  input: Parameters<typeof recordIntrospectionAudit>[0],
): Promise<boolean> {
  const now = Date.now();
  if ((rateLimitAuditNextAllowedAt.get(scope) ?? 0) > now) return true;

  // Set before awaiting so a concurrent denied burst produces one durable
  // event for this enforcement window instead of one database write per packet.
  rateLimitAuditNextAllowedAt.set(scope, now + windowMs);
  const recorded = await recordIntrospectionAudit(input);
  if (!recorded) rateLimitAuditNextAllowedAt.delete(scope);
  return recorded;
}

async function recordIntrospectionAudit(input: {
  resourceServerAudience?: string | null;
  requestedAudience?: string | null;
  token?: string | null;
  sessionId?: string | null;
  clientId?: string | null;
  sourceIdentity?: string | null;
  outcome: Parameters<typeof ResourceIntrospectionAuditEvent.create>[0]['outcome'];
}): Promise<boolean> {
  const tokenSelector = input.token ? Session.parse(input.token)?.selector : null;
  try {
    await repository.recordResourceIntrospectionAudit(
      ResourceIntrospectionAuditEvent.create({
        outcome: input.outcome,
        ...(input.resourceServerAudience !== undefined
          ? { resourceServerAudience: input.resourceServerAudience }
          : {}),
        ...(input.requestedAudience !== undefined
          ? { requestedAudience: input.requestedAudience }
          : {}),
        ...(tokenSelector !== undefined ? { tokenSelector } : {}),
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
        ...(input.sourceIdentity !== undefined ? { sourceIdentity: input.sourceIdentity } : {}),
      }),
    );
    return true;
  } catch {
    console.error('[fortressauth] resource introspection audit write failed');
    return false;
  }
}

function publicUser(user: { id: string; email: string; emailVerified: boolean; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Reads JSON from the request and validates it against the supplied schema.
 * Returns either the parsed value or a structured error suitable for use in
 * the route's `c.json(response, status)` call.
 *
 * Maps schema failures (missing `email`, wrong types, etc.) to
 * `INVALID_EMAIL` or `INVALID_PASSWORD` where unambiguous, otherwise falls
 * back to `INVALID_EMAIL` as the closest 400-class code from our existing
 * AuthErrorCode set. The mapping is conservative so we don't have to extend
 * the public error code surface.
 */
async function parseJsonBody<T extends z.ZodTypeAny>(
  c: { req: { json: () => Promise<unknown> } },
  schema: T,
): Promise<
  { ok: true; data: z.output<T> } | { ok: false; errorCode: AuthErrorCode; details: string }
> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch (error) {
    return {
      ok: false,
      errorCode: 'INVALID_EMAIL',
      details: `Malformed JSON body: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  }

  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  // Pick the most relevant error code based on which field failed first.
  const firstIssue = result.error.issues[0];
  const fieldPath = firstIssue?.path.join('.') ?? '';
  const errorCode: AuthErrorCode = fieldPath.includes('password')
    ? 'INVALID_PASSWORD'
    : 'INVALID_EMAIL';

  return {
    ok: false,
    errorCode,
    details: result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; '),
  };
}

// Auth routes
app.post('/auth/signup', async (c) => {
  try {
    const parsed = await parseJsonBody(c, credentialsSchema);
    if (!parsed.ok) {
      const { response, status } = createError(parsed.errorCode, parsed.details);
      return c.json(response, status);
    }

    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent');

    const result = await fortress.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
    });

    if (!result.success) {
      const { response, status } = createError(result.error, 'Signup failed');
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
    const parsed = await parseJsonBody(c, credentialsSchema);
    if (!parsed.ok) {
      const { response, status } = createError(parsed.errorCode, parsed.details);
      return c.json(response, status);
    }

    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent');

    const result = await fortress.signIn({
      email: parsed.data.email,
      password: parsed.data.password,
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
    });

    if (!result.success) {
      const { response, status } = createError(result.error, 'Login failed');
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

app.post('/auth/resource/introspect', async (c) => {
  const sourceIdentity = getTrustedRateLimitIdentity(c);
  if (c.req.header('content-type') !== 'application/x-www-form-urlencoded') {
    const recorded = await recordIntrospectionAudit({
      sourceIdentity,
      outcome: 'request_rejected',
    });
    return c.json({ active: false }, recorded ? 415 : 503);
  }

  const rawBody = await c.req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > env.RESOURCE_INTROSPECTION_MAX_BODY_BYTES) {
    const recorded = await recordIntrospectionAudit({
      sourceIdentity,
      outcome: 'request_rejected',
    });
    return c.json({ active: false }, recorded ? 413 : 503);
  }

  const form = new URLSearchParams(rawBody);
  const keys = [...form.keys()];
  const hasExactFields =
    keys.length === 2 &&
    keys.every((key) => key === 'token' || key === 'audience') &&
    form.getAll('token').length === 1 &&
    form.getAll('audience').length === 1;
  const parsed = hasExactFields
    ? introspectionFieldSchema.safeParse({
        token: form.get('token'),
        audience: form.get('audience'),
      })
    : null;
  if (!parsed?.success) {
    const recorded = await recordIntrospectionAudit({
      requestedAudience: form.get('audience'),
      sourceIdentity,
      outcome: 'request_rejected',
    });
    return c.json({ active: false }, recorded ? 400 : 503);
  }

  const resource = authenticateResourceServer(c.req.header('authorization'));
  if (!resource) {
    const recorded = await recordIntrospectionAudit({
      requestedAudience: parsed.data.audience,
      token: parsed.data.token,
      sourceIdentity,
      outcome: 'credential_rejected',
    });
    return c.json({ active: false }, recorded ? 401 : 503);
  }

  const audienceHash = hashIdentifier(resource.audience);
  const resourceAction = `resourceIntrospection:${audienceHash}`;
  const resourceAllowed = await enforceIntrospectionRateLimits([
    { identifier: `resource:${audienceHash}`, action: resourceAction },
    {
      identifier: `audience:${hashIdentifier(parsed.data.audience)}`,
      action: resourceAction,
    },
    {
      identifier: `source:${hashIdentifier(sourceIdentity)}`,
      action: resourceAction,
    },
    {
      identifier: `combined:${hashIdentifier(`${resource.audience}\0${parsed.data.audience}\0${sourceIdentity}`)}`,
      action: resourceAction,
    },
  ]);
  if (!resourceAllowed) {
    const recorded = await recordRateLimitedAuditOnce(
      `resource:${audienceHash}`,
      resource.rateLimit.windowMs,
      {
        resourceServerAudience: resource.audience,
        requestedAudience: parsed.data.audience,
        token: parsed.data.token,
        sourceIdentity,
        outcome: 'rate_limited',
      },
    );
    return c.json({ active: false }, recorded ? 429 : 503);
  }

  let result: Awaited<ReturnType<typeof fortress.introspectNativeSession>>;
  try {
    result = await fortress.introspectNativeSession({
      token: parsed.data.token,
      audience: parsed.data.audience,
      authenticatedResourceAudience: resource.audience,
    });
  } catch {
    console.error('[fortressauth] resource introspection lookup failed');
    await recordIntrospectionAudit({
      resourceServerAudience: resource.audience,
      requestedAudience: parsed.data.audience,
      token: parsed.data.token,
      sourceIdentity,
      outcome: 'lookup_failed',
    });
    return c.json({ active: false }, 503);
  }
  if (!result) {
    const recorded = await recordIntrospectionAudit({
      resourceServerAudience: resource.audience,
      requestedAudience: parsed.data.audience,
      token: parsed.data.token,
      sourceIdentity,
      outcome: 'inactive',
    });
    return c.json({ active: false }, recorded ? 200 : 503);
  }

  const recorded = await recordIntrospectionAudit({
    resourceServerAudience: resource.audience,
    requestedAudience: parsed.data.audience,
    token: parsed.data.token,
    sessionId: result.sessionId,
    clientId: result.clientId,
    sourceIdentity,
    outcome: 'active',
  });
  if (!recorded) return c.json({ active: false }, 503);

  return c.json({
    active: true,
    sub: result.userId,
    email: result.email,
    email_verified: true,
    aud: result.audience,
    client_id: result.clientId,
    exp: Math.floor(result.expiresAt.getTime() / 1000),
    sid: result.sessionId,
    auth_time: result.authenticationTime
      ? Math.floor(result.authenticationTime.getTime() / 1000)
      : null,
  });
});

app.post('/auth/native/token', async (c) => {
  try {
    const parsed = await parseJsonBody(c, nativeTokenSchema);
    if (!parsed.ok) {
      const { response, status } = createError('NATIVE_AUTHORIZATION_INVALID', parsed.details);
      return c.json(response, status);
    }
    const userAgent = c.req.header('user-agent');
    const result = await fortress.exchangeNativeAuthorizationCode({
      clientId: parsed.data.clientId,
      code: parsed.data.code,
      redirectUri: parsed.data.redirectUri,
      codeVerifier: parsed.data.codeVerifier,
      ipAddress: getClientIp(c),
      ...(userAgent ? { userAgent } : {}),
    });
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    if (!result.success) {
      const { response, status } = createError(
        'NATIVE_AUTHORIZATION_INVALID',
        'Native authorization code exchange failed',
      );
      return c.json(response, status);
    }
    return c.json(
      success({
        token: result.data.token,
        tokenType: 'Bearer' as const,
        expiresAt: result.data.expiresAt.toISOString(),
        user: publicUser(result.data.user),
      }),
    );
  } catch (error) {
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Unexpected native token exchange error',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
  }
});

app.get('/auth/native/session', async (c) => {
  const token = getBearerToken(c.req.header('authorization'));
  if (!token) {
    const { response, status } = createError('SESSION_INVALID', 'Bearer token required');
    return c.json(response, status);
  }
  const result = await fortress.validateSession(token);
  if (!result.success) {
    const { response, status } = createError(result.error, 'Session validation failed');
    return c.json(response, status);
  }
  return c.json(success({ user: publicUser(result.data.user) }));
});

app.post('/auth/native/logout', async (c) => {
  const token = getBearerToken(c.req.header('authorization'));
  if (!token) {
    const { response, status } = createError('SESSION_INVALID', 'Bearer token required');
    return c.json(response, status);
  }
  const result = await fortress.signOut(token);
  if (!result.success) {
    const { response, status } = createError(result.error, 'Session logout failed');
    return c.json(response, status);
  }
  return c.json({ success: true });
});

app.post('/auth/verify-email', async (c) => {
  try {
    const parsed = await parseJsonBody(c, tokenOnlySchema);
    if (!parsed.ok) {
      const { response, status } = createError(parsed.errorCode, parsed.details);
      return c.json(response, status);
    }

    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent');
    const result = await fortress.verifyEmail(parsed.data.token, {
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
    const parsed = await parseJsonBody(c, requestPasswordResetSchema);
    if (!parsed.ok) {
      const { response, status } = createError(parsed.errorCode, parsed.details);
      return c.json(response, status);
    }

    const result = await fortress.requestPasswordReset(parsed.data.email);

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
    const parsed = await parseJsonBody(c, resetPasswordSchema);
    if (!parsed.ok) {
      const { response, status } = createError(parsed.errorCode, parsed.details);
      return c.json(response, status);
    }

    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent');
    const result = await fortress.resetPassword({
      token: parsed.data.token,
      newPassword: parsed.data.newPassword,
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

// OAuth Routes
app.get('/auth/native/authorize/:provider', async (c) => {
  const providerId = c.req.param('provider') as OAuthProviderId;
  const provider = oauthProviders[providerId];
  const parsed = nativeAuthorizeQuerySchema.safeParse(c.req.query());
  if (!provider) {
    const { response, status } = createError('OAUTH_NOT_SUPPORTED', 'Provider not supported');
    return c.json(response, status);
  }
  if (!parsed.success) {
    const { response, status } = createError(
      'NATIVE_AUTHORIZATION_INVALID',
      parsed.error.issues.map((issue) => issue.message).join('; '),
    );
    return c.json(response, status);
  }
  try {
    const redirect = new URL(parsed.data.redirect_uri);
    if (
      redirect.hash ||
      redirect.searchParams.has('code') ||
      redirect.searchParams.has('state') ||
      redirect.searchParams.has('error') ||
      redirect.searchParams.has('error_description')
    ) {
      const { response, status } = createError(
        'NATIVE_REDIRECT_URI_INVALID',
        'Redirect URI contains forbidden components',
      );
      return c.json(response, status);
    }
    const authorizationUrl = await fortress.getOAuthAuthorizationUrl(provider, providerId, {
      native: {
        clientId: parsed.data.client_id,
        redirectUri: parsed.data.redirect_uri,
        codeChallenge: parsed.data.code_challenge,
        state: parsed.data.state,
        ...(parsed.data.audience ? { audience: parsed.data.audience } : {}),
        ...(parsed.data.max_age !== undefined ? { maxAgeSeconds: parsed.data.max_age } : {}),
      },
    });
    return c.redirect(authorizationUrl);
  } catch (error) {
    const code: AuthErrorCode =
      error instanceof Error &&
      ['NATIVE_REDIRECT_URI_INVALID', 'NATIVE_AUDIENCE_INVALID', 'STEP_UP_UNSUPPORTED'].includes(
        error.message,
      )
        ? (error.message as AuthErrorCode)
        : 'INTERNAL_ERROR';
    if (
      (code === 'NATIVE_AUDIENCE_INVALID' || code === 'STEP_UP_UNSUPPORTED') &&
      fortress.isRegisteredNativeRedirect(parsed.data.client_id, parsed.data.redirect_uri)
    ) {
      return redirectNativeOAuthError(
        c,
        { redirectUri: parsed.data.redirect_uri, state: parsed.data.state },
        code,
      );
    }
    const { response, status } = createError(code, 'Failed to initiate native authorization');
    return c.json(response, status);
  }
});

app.get('/auth/oauth/:provider', async (c) => {
  const providerId = c.req.param('provider') as OAuthProviderId;
  const provider = oauthProviders[providerId];

  if (!provider) {
    const { response, status } = createError(
      'OAUTH_NOT_SUPPORTED',
      `Provider ${providerId} not supported`,
    );
    return c.json(response, status);
  }

  try {
    const url = await fortress.getOAuthAuthorizationUrl(provider, providerId);
    return c.redirect(url);
  } catch (error) {
    console.error('[fortressauth] OAuth initiation failed');
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Failed to initiate OAuth flow',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
  }
});

app.get('/auth/oauth/:provider/callback', async (c) => {
  const providerId = c.req.param('provider') as OAuthProviderId;
  const provider = oauthProviders[providerId];
  const code = c.req.query('code');
  const state = c.req.query('state');
  const providerError = c.req.query('error');

  if (!state) {
    const { response, status } = createError('OAUTH_AUTH_FAILED', 'Invalid callback parameters');
    return c.json(response, status);
  }

  if (providerError || !code || !provider) {
    try {
      const nativeTarget = await fortress.consumeNativeOAuthFailure(providerId, state);
      if (nativeTarget.success) {
        return redirectNativeOAuthError(
          c,
          nativeTarget.data,
          provider ? 'OAUTH_AUTH_FAILED' : 'OAUTH_NOT_SUPPORTED',
        );
      }
    } catch {
      console.error('[fortressauth] OAuth failure callback processing failed');
    }
    const { response, status } = createError(
      provider ? 'OAUTH_AUTH_FAILED' : 'OAUTH_NOT_SUPPORTED',
      'Invalid callback parameters',
    );
    return c.json(response, status);
  }

  let nativeTarget: NativeReturnTarget | null = null;
  try {
    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent');

    const result = await fortress.handleOAuthCallback(provider, providerId, code, state, {
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
      onNativeReturn: (target) => {
        nativeTarget = target;
      },
    });

    if (!result.success) {
      if (nativeTarget) return redirectNativeOAuthError(c, nativeTarget, result.error);
      const { response, status } = createError(result.error, 'OAuth authentication failed');
      return c.json(response, status);
    }

    if ('authorizationCode' in result.data) {
      const redirect = new URL(result.data.redirectUri);
      redirect.searchParams.set('code', result.data.authorizationCode);
      redirect.searchParams.set('state', result.data.state);
      c.header('Cache-Control', 'no-store');
      return c.redirect(redirect.toString());
    }

    const { user, token } = result.data;
    setSessionCookie(c, token);

    // Redirect to frontend or return JSON based on request
    const acceptHeader = c.req.header('accept');
    if (acceptHeader?.includes('application/json')) {
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
    }

    return c.redirect(env.BASE_URL);
  } catch (error) {
    console.error('[fortressauth] OAuth callback processing failed');
    if (nativeTarget) return redirectNativeOAuthError(c, nativeTarget, 'INTERNAL_ERROR');
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Unexpected error during OAuth callback',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
  }
});

// Apple uses form_post for its callback, so we need a POST route too
app.post('/auth/oauth/apple/callback', async (c) => {
  let nativeTarget: NativeReturnTarget | null = null;
  try {
    const body = await c.req.parseBody();
    const code = typeof body.code === 'string' ? body.code : null;
    const state = typeof body.state === 'string' ? body.state : null;
    const providerError = typeof body.error === 'string' ? body.error : null;

    if (!state) {
      const { response, status } = createError(
        'OAUTH_AUTH_FAILED',
        'Invalid Apple callback parameters',
      );
      return c.json(response, status);
    }

    if (providerError || !code) {
      const target = await fortress.consumeNativeOAuthFailure('apple', state);
      if (target.success) {
        return redirectNativeOAuthError(c, target.data, 'OAUTH_AUTH_FAILED');
      }
      const { response, status } = createError(
        'OAUTH_AUTH_FAILED',
        'Invalid Apple callback parameters',
      );
      return c.json(response, status);
    }

    const provider = oauthProviders.apple;
    if (!provider) {
      const { response, status } = createError('OAUTH_NOT_SUPPORTED', 'Apple provider not enabled');
      return c.json(response, status);
    }

    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent');

    const result = await fortress.handleOAuthCallback(provider, 'apple', code, state, {
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
      onNativeReturn: (target) => {
        nativeTarget = target;
      },
    });

    if (!result.success) {
      if (nativeTarget) return redirectNativeOAuthError(c, nativeTarget, result.error);
      const { response, status } = createError(result.error, 'Apple authentication failed');
      return c.json(response, status);
    }

    if ('authorizationCode' in result.data) {
      const redirect = new URL(result.data.redirectUri);
      redirect.searchParams.set('code', result.data.authorizationCode);
      redirect.searchParams.set('state', result.data.state);
      c.header('Cache-Control', 'no-store');
      return c.redirect(redirect.toString());
    }

    const { token } = result.data;
    setSessionCookie(c, token);

    return c.redirect(env.BASE_URL);
  } catch (error) {
    console.error('[fortressauth] Apple callback processing failed');
    if (nativeTarget) return redirectNativeOAuthError(c, nativeTarget, 'INTERNAL_ERROR');
    const { response, status } = createError(
      'INTERNAL_ERROR',
      'Unexpected error during Apple callback',
      error instanceof Error ? error : undefined,
    );
    return c.json(response, status);
  }
});

// Export app for testing
export { app };

// Reference to the running HTTP server, captured at startup so the graceful
// shutdown handler can stop accepting new connections before tearing down
// dependencies. `null` when the module is imported in tests rather than run
// as the main module.
let httpServer: import('node:http').Server | import('node:http2').Http2Server | null = null;

// Tracks whether shutdown is in progress so a second SIGTERM/SIGINT does not
// kick off a parallel teardown.
let isShuttingDown = false;

// Graceful shutdown handler. Stops the HTTP listener (so health checks and
// load balancers can drain), closes the database pool, quits Redis, and only
// then exits. Each step is wrapped in `Promise.allSettled` so a single
// failure does not prevent the others from running.
async function gracefulShutdown(signal: string, exitCode = 0): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  clearInterval(auditRetentionTimer);
  console.log(`\n${signal} received. Shutting down gracefully...`);

  const shutdownTimeoutMs = 10_000;
  const timeout = setTimeout(() => {
    console.error(`[shutdown] Timed out after ${shutdownTimeoutMs}ms; forcing exit.`);
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, shutdownTimeoutMs);
  // Don't keep the event loop alive solely for the timeout.
  timeout.unref();

  const tasks: Promise<unknown>[] = [];

  if (httpServer) {
    tasks.push(
      new Promise<void>((resolve) => {
        httpServer?.close((err) => {
          if (err) {
            console.error('[shutdown] HTTP server close failed', err);
          }
          resolve();
        });
      }),
    );
  }

  tasks.push(
    Promise.resolve()
      .then(() => close())
      .catch((error: unknown) => {
        console.error('[shutdown] Database close failed', error);
      }),
  );

  if (redisClient) {
    tasks.push(
      redisClient.quit().catch((error: unknown) => {
        console.error('[shutdown] Redis quit failed', error);
      }),
    );
  }

  await Promise.allSettled(tasks);
  clearTimeout(timeout);
  console.log('[shutdown] Cleanup complete.');
  process.exit(exitCode);
}

// Utility to check if a port is available
async function isPortAvailable(port: number, hostname: string): Promise<boolean> {
  try {
    const { createServer } = await import('node:net');
    return await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, hostname);
    });
  } catch (error) {
    console.error('[startup] Failed to probe port availability', error);
    return false;
  }
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

/**
 * Redacts the password from a database connection string for safe logging.
 * Handles common formats:
 *   - postgresql://user:password@host:5432/db
 *   - postgresql://user:password@host:5432/db?sslmode=require
 *   - mysql://user:password@host:3306/db
 *   - sqlite file paths (returned as-is, no credentials)
 */
function redactDatabaseUrl(url: string): string {
  if (!url) return url;
  // Match scheme://user:password@... and replace password with ***.
  const match = url.match(/^([^:]+:\/\/[^:@/]+:)([^@]*)(@.+)$/);
  if (match) {
    return `${match[1]}***${match[3]}`;
  }
  // Non-credentialed URL (e.g. SQLite file path): return as-is.
  return url;
}

/**
 * Returns the trusted client IP from the request headers, accounting for the
 * configured number of trusted reverse-proxy hops between the app and the
 * client.
 *
 * The X-Forwarded-For header is appended to as a request travels through
 * proxies: leftmost is the original client (untrusted), rightmost is the
 * most recent proxy (trusted, because it's the one immediately upstream of
 * us). For a request that traversed N trusted hops (e.g. 1 ALB), the
 * client-controlled prefix has at most `total-N` entries; the leftmost
 * trusted entry is at position `total-N` from the right.
 *
 * TRUSTED_PROXY_HOP_COUNT defaults to 0, meaning "do not trust XFF at all"
 * (use the connection IP, which is unavailable in Hono's context API in
 * the same way it is in Express). To preserve current behavior in tests
 * and local dev, we fall back to the leftmost XFF entry when hop count is
 * 0 and XFF is set; this matches how it worked before. In production
 * behind ALB, set TRUSTED_PROXY_HOP_COUNT=1 (or higher if there are more
 * proxies in front of ALB).
 */
function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const trustedHops = env.TRUSTED_PROXY_HOP_COUNT;
  const xff = c.req.header('x-forwarded-for');

  if (xff && trustedHops > 0) {
    const parts = xff
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      // Walk from the right, skipping `trustedHops - 1` proxies, then take
      // the next entry (the actual client IP as recorded by the trusted
      // outermost proxy).
      const trustedIndex = Math.max(0, parts.length - trustedHops);
      return parts[trustedIndex] || 'unknown';
    }
  }

  // Backward-compatible fallback: trusted hops=0 (default) keeps existing
  // behavior so SQLite/local dev and test environments don't break. Header
  // is still attacker-controlled in this mode; do NOT use for security
  // decisions (rate limiting) without setting TRUSTED_PROXY_HOP_COUNT > 0.
  if (xff) {
    const parts = xff
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[0] || 'unknown';
    }
  }

  const xri = c.req.header('x-real-ip');
  if (xri) return xri;

  return 'unknown';
}

function getTrustedRateLimitIdentity(c: Context): string {
  let directAddress: string | undefined;
  try {
    directAddress = getConnInfo(c).remote.address;
  } catch {
    // app.request() and non-Node test adapters do not expose socket bindings.
  }
  return resolveTrustedSourceIdentity({
    trustedProxyHopCount: env.TRUSTED_PROXY_HOP_COUNT,
    forwardedFor: c.req.header('x-forwarded-for'),
    directAddress,
  });
}

async function resolveServerPort(
  startPort: number,
  hostname: string,
  strictPort: boolean,
): Promise<number> {
  if (!strictPort) {
    return findAvailablePort(startPort, hostname);
  }

  const available = await isPortAvailable(startPort, hostname);
  if (!available) {
    throw new Error(
      `Port ${startPort} is already in use and STRICT_PORT=true. Stop the other process or choose a different port before starting the server.`,
    );
  }

  return startPort;
}

// Start server if running as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  // Register shutdown handlers
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });

  // Process-wide safety nets. Without these, a single floating rejection
  // (Redis blip, OAuth provider 5xx in a fire-and-forget path, etc.) can
  // crash the entire server. We log loudly and keep running for
  // unhandledRejection; for uncaughtException we log and trigger a graceful
  // shutdown because the process state may be corrupted.
  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] unhandledRejection', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('[fatal] uncaughtException', error);
    void gracefulShutdown('uncaughtException', 1);
  });

  console.log(`🚀 FortressAuth server v${VERSION} starting...`);
  console.log(`📊 Database: ${redactDatabaseUrl(env.DATABASE_URL)}`);

  // Resolve the startup port, either by walking to the next free port or by
  // failing fast when an external orchestrator already chose one.
  resolveServerPort(env.PORT, env.HOST, env.STRICT_PORT)
    .then(async (availablePort) => {
      if (availablePort !== env.PORT) {
        console.log(
          `⚠ Port ${env.PORT} is in use by another process, using available port ${availablePort} instead.`,
        );
      }

      console.log(`🌐 Server: http://${env.HOST}:${availablePort}`);
      console.log(`📖 API Docs: http://${env.HOST}:${availablePort}/docs`);

      // Use @hono/node-server for Node.js runtime
      const { serve } = await import('@hono/node-server');
      httpServer = serve({
        fetch: app.fetch,
        port: availablePort,
        hostname: env.HOST,
      });
    })
    .catch((error: unknown) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}
