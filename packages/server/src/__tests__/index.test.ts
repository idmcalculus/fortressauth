import { type Database as DatabaseSchema, down, SqlAdapter, up } from '@fortressauth/adapter-sql';
import { FortressAuth, MemoryRateLimiter } from '@fortressauth/core';
import Database from 'better-sqlite3';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { Kysely, SqliteDialect } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Response types
interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

interface AuthSuccessResponse {
  success: true;
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
  };
}

interface AuthErrorResponse {
  success: false;
  error: string;
}

type AuthResponse = AuthSuccessResponse | AuthErrorResponse;

interface LogoutResponse {
  success: boolean;
}

// Create a test app similar to the main app
function createTestApp() {
  const sqlite = new Database(':memory:');
  const db = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  const repository = new SqlAdapter(db, { dialect: 'sqlite' });
  const rateLimiter = new MemoryRateLimiter();
  const fortress = new FortressAuth(repository, rateLimiter, {
    session: { cookieSecure: false },
    rateLimit: { enabled: false }, // Disable for tests
  });

  const config = fortress.getConfig();
  const app = new Hono();

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      version: '0.1.4',
      timestamp: new Date().toISOString(),
    });
  });

  // Helper functions
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

  function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string): void {
    setCookie(c, config.session.cookieName, token, {
      httpOnly: true,
      secure: config.session.cookieSecure,
      sameSite: getSameSite(),
      path: '/',
      maxAge: Math.floor(config.session.ttlMs / 1000),
    });
  }

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
      const ipAddress = c.req.header('x-forwarded-for') ?? 'unknown';
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
    } catch (_error) {
      return c.json({ success: false, error: 'INTERNAL_ERROR' }, 500);
    }
  });

  app.post('/auth/login', async (c) => {
    try {
      const body = await c.req.json();
      const ipAddress = c.req.header('x-forwarded-for') ?? 'unknown';
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
    } catch (_error) {
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
    } catch (_error) {
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

      return c.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt.toISOString(),
        },
      });
    } catch (_error) {
      return c.json({ success: false, error: 'INTERNAL_ERROR' }, 500);
    }
  });

  return { app, db, sqlite };
}

describe('Server API', () => {
  let app: Hono;
  let db: Kysely<DatabaseSchema>;
  let sqlite: Database.Database;

  beforeAll(async () => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
    sqlite = testApp.sqlite;
    await up(db);
  });

  afterAll(async () => {
    await down(db);
    await db.destroy();
    sqlite.close();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await app.request('/health');
      const body = (await res.json()) as HealthResponse;

      expect(res.status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.version).toBe('0.1.4');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('POST /auth/signup', () => {
    it('should create a new user', async () => {
      const res = await app.request('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'SecurePass123!',
        }),
      });

      const body = (await res.json()) as AuthResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.user.email).toBe('newuser@example.com');
        expect(body.user.emailVerified).toBe(false);
      }

      // Check cookie is set
      const cookie = res.headers.get('set-cookie');
      expect(cookie).toContain('fortress_session=');
    });

    it('should return error for duplicate email', async () => {
      // First signup
      await app.request('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'duplicate@example.com',
          password: 'SecurePass123!',
        }),
      });

      // Second signup with same email
      const res = await app.request('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'duplicate@example.com',
          password: 'AnotherPass123!',
        }),
      });

      const body = (await res.json()) as AuthResponse;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error).toBe('EMAIL_EXISTS');
      }
    });

    it('should return error for weak password', async () => {
      const res = await app.request('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'weakpass@example.com',
          password: 'weak',
        }),
      });

      const body = (await res.json()) as AuthResponse;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error).toBe('PASSWORD_TOO_WEAK');
      }
    });
  });

  describe('POST /auth/login', () => {
    beforeAll(async () => {
      // Create a user for login tests
      await app.request('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'logintest@example.com',
          password: 'SecurePass123!',
        }),
      });
    });

    it('should login with correct credentials', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'logintest@example.com',
          password: 'SecurePass123!',
        }),
      });

      const body = (await res.json()) as AuthResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.user.email).toBe('logintest@example.com');
      }

      // Check cookie is set
      const cookie = res.headers.get('set-cookie');
      expect(cookie).toContain('fortress_session=');
    });

    it('should return error for wrong password', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'logintest@example.com',
          password: 'WrongPassword',
        }),
      });

      const body = (await res.json()) as AuthResponse;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should return error for non-existent user', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'AnyPassword123!',
        }),
      });

      const body = (await res.json()) as AuthResponse;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error).toBe('INVALID_CREDENTIALS');
      }
    });
  });

  describe('GET /auth/me', () => {
    it('should return user info with valid session', async () => {
      // Login first
      const loginRes = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'logintest@example.com',
          password: 'SecurePass123!',
        }),
      });

      const cookie = loginRes.headers.get('set-cookie') ?? '';

      // Get user info
      const res = await app.request('/auth/me', {
        headers: { Cookie: cookie },
      });

      const body = (await res.json()) as AuthResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.user.email).toBe('logintest@example.com');
      }
    });

    it('should return error without session', async () => {
      const res = await app.request('/auth/me');
      const body = (await res.json()) as AuthResponse;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error).toBe('SESSION_INVALID');
      }
    });

    it('should return error with invalid session', async () => {
      const res = await app.request('/auth/me', {
        headers: { Cookie: 'fortress_session=invalid-token' },
      });

      const body = (await res.json()) as AuthResponse;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error).toBe('SESSION_INVALID');
      }
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout and clear session', async () => {
      // Login first
      const loginRes = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'logintest@example.com',
          password: 'SecurePass123!',
        }),
      });

      const cookie = loginRes.headers.get('set-cookie') ?? '';

      // Logout
      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Cookie: cookie },
      });

      const body = (await res.json()) as LogoutResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);

      // Verify session is invalidated
      const meRes = await app.request('/auth/me', {
        headers: { Cookie: cookie },
      });

      expect(meRes.status).toBe(401);
    });

    it('should succeed even without session', async () => {
      const res = await app.request('/auth/logout', {
        method: 'POST',
      });

      const body = (await res.json()) as LogoutResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });
});
