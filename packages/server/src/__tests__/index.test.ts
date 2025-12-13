import { type Database as DatabaseSchema, down, SqlAdapter, up } from '@fortressauth/adapter-sql';
import { FortressAuth, MemoryRateLimiter, type EmailProviderPort } from '@fortressauth/core';
import Database from 'better-sqlite3';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { Kysely, SqliteDialect } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface UserPayload {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
  };
}

class TestEmailProvider implements EmailProviderPort {
  verificationTokens: string[] = [];
  resetTokens: string[] = [];

  async sendVerificationEmail(_email: string, verificationLink: string): Promise<void> {
    const token = new URL(verificationLink).searchParams.get('token');
    if (token) {
      this.verificationTokens.push(token);
    }
  }

  async sendPasswordResetEmail(_email: string, resetLink: string): Promise<void> {
    const token = new URL(resetLink).searchParams.get('token');
    if (token) {
      this.resetTokens.push(token);
    }
  }
}

function createTestApp() {
  const sqlite = new Database(':memory:');
  const db = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  const repository = new SqlAdapter(db, { dialect: 'sqlite' });
  const rateLimiter = new MemoryRateLimiter({ login: { maxTokens: 100, refillRateMs: 1000, windowMs: 60000 } });
  const emailProvider = new TestEmailProvider();
  const fortress = new FortressAuth(repository, rateLimiter, emailProvider, {
    session: { cookieSecure: false, cookieSameSite: 'strict' },
    rateLimit: { enabled: false },
    urls: { baseUrl: 'http://localhost:3000' },
  });

  const config = fortress.getConfig();
  const app = new Hono();

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

  const respond = <T>(data: T) => ({ success: true, data });

  app.post('/auth/signup', async (c) => {
    const body = await c.req.json();
    const result = await fortress.signUp({ email: body.email, password: body.password });
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
    const { user, token } = result.data;
    setSessionCookie(c, token);
    return c.json(respond({
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
      },
    }));
  });

  app.post('/auth/login', async (c) => {
    const body = await c.req.json();
    const result = await fortress.signIn({ email: body.email, password: body.password });
    if (!result.success) {
      const status = result.error === 'EMAIL_NOT_VERIFIED' ? 403 : 401;
      return c.json({ success: false, error: result.error }, status);
    }
    const { user, token } = result.data;
    setSessionCookie(c, token);
    return c.json(respond({
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
      },
    }));
  });

  app.get('/auth/me', async (c) => {
    const token = getCookie(c, config.session.cookieName);
    if (!token) {
      return c.json({ success: false, error: 'SESSION_INVALID' }, 401);
    }
    const result = await fortress.validateSession(token);
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 401);
    }
    const { user } = result.data;
    return c.json(respond({
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
      },
    }));
  });

  app.post('/auth/verify-email', async (c) => {
    const body = await c.req.json();
    const result = await fortress.verifyEmail(body.token);
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
    return c.json(respond({ verified: true }));
  });

  app.post('/auth/logout', async (c) => {
    const token = getCookie(c, config.session.cookieName);
    if (token) {
      await fortress.signOut(token);
    }
    clearSessionCookie(c);
    return c.json({ success: true });
  });

  return { app, db, sqlite, emailProvider };
}

describe('Server API', () => {
  let app: Hono;
  let db: Kysely<DatabaseSchema>;
  let sqlite: Database.Database;
  let emailProvider: TestEmailProvider;
  let verificationToken: string | null = null;

  beforeAll(async () => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
    sqlite = testApp.sqlite;
    emailProvider = testApp.emailProvider;
    await up(db);
  });

  afterAll(async () => {
    await down(db);
    await db.destroy();
    sqlite.close();
  });

  it('should signup and send verification email', async () => {
    const res = await app.request('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newuser@example.com', password: 'SecurePass123!' }),
    });

    const body = (await res.json()) as ApiResponse<UserPayload>;
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    verificationToken = emailProvider.verificationTokens.at(-1) ?? null;
    expect(verificationToken).toBeTruthy();
  });

  it('should verify email', async () => {
    const res = await app.request('/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verificationToken }),
    });

    const body = (await res.json()) as ApiResponse<{ verified: boolean }>;
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('should login after verification and return cookie', async () => {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newuser@example.com', password: 'SecurePass123!' }),
    });

    const body = (await res.json()) as ApiResponse<UserPayload>;
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('fortress_session=');

    const meRes = await app.request('/auth/me', {
      headers: { Cookie: cookie ?? '' },
    });
    const meBody = (await meRes.json()) as ApiResponse<UserPayload>;
    expect(meRes.status).toBe(200);
    expect(meBody.success).toBe(true);
  });
});
