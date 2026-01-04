import { randomBytes, timingSafeEqual } from 'node:crypto';
import { type Database as DatabaseSchema, down, SqlAdapter, up } from '@fortressauth/adapter-sql';
import { type EmailProviderPort, FortressAuth, MemoryRateLimiter } from '@fortressauth/core';
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

const CSRF_COOKIE_NAME = 'fortress_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

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
  const rateLimiter = new MemoryRateLimiter({
    login: { maxTokens: 100, refillRateMs: 1000, windowMs: 60000 },
  });
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

  function setCsrfCookie(c: Parameters<typeof setCookie>[0], token: string): void {
    setCookie(c, CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
      path: '/',
      maxAge: 2 * 60 * 60,
    });
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

  const respond = <T>(data: T) => ({ success: true, data });

  app.use('/auth/*', async (c, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(c.req.method)) {
      const headerToken = c.req.header(CSRF_HEADER_NAME);
      const cookieToken = getCookie(c, CSRF_COOKIE_NAME);
      if (!headerToken || !cookieToken || !isValidCsrfToken(headerToken, cookieToken)) {
        return c.json({ success: false, error: 'CSRF_TOKEN_INVALID' }, 403);
      }
    }
    await next();
  });

  app.get('/auth/csrf', (c) => {
    const token = generateCsrfToken();
    setCsrfCookie(c, token);
    return c.json(respond({ csrfToken: token }));
  });

  app.post('/auth/signup', async (c) => {
    const body = await c.req.json();
    const result = await fortress.signUp({ email: body.email, password: body.password });
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
    const { user, token } = result.data;
    setSessionCookie(c, token);
    return c.json(
      respond({
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt.toISOString(),
        },
      }),
    );
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
    return c.json(
      respond({
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt.toISOString(),
        },
      }),
    );
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
    return c.json(
      respond({
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt.toISOString(),
        },
      }),
    );
  });

  app.post('/auth/verify-email', async (c) => {
    const body = await c.req.json();
    const result = await fortress.verifyEmail(body.token);
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
    return c.json(respond({ verified: true }));
  });

  app.post('/auth/request-password-reset', async (c) => {
    const body = await c.req.json();
    const result = await fortress.requestPasswordReset(body.email);
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
    return c.json(respond({ requested: true }));
  });

  app.post('/auth/reset-password', async (c) => {
    const body = await c.req.json();
    const result = await fortress.resetPassword({
      token: body.token,
      newPassword: body.newPassword,
    });
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
    return c.json(respond({ reset: true }));
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
  let resetToken: string | null = null;
  let csrfToken: string | null = null;
  let csrfCookie: string | null = null;

  beforeAll(async () => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
    sqlite = testApp.sqlite;
    emailProvider = testApp.emailProvider;
    await up(db);

    const csrfRes = await app.request('/auth/csrf');
    const csrfBody = (await csrfRes.json()) as ApiResponse<{ csrfToken: string }>;
    csrfToken = csrfBody.data?.csrfToken ?? null;
    const cookieHeader = csrfRes.headers.get('set-cookie');
    csrfCookie = cookieHeader ? cookieHeader.split(';')[0] : null;

    if (!csrfToken || !csrfCookie) {
      throw new Error('Failed to initialize CSRF test context');
    }
  });

  afterAll(async () => {
    await down(db);
    await db.destroy();
    sqlite.close();
  });

  const csrfHeaders = () => ({
    'Content-Type': 'application/json',
    [CSRF_HEADER_NAME]: csrfToken ?? '',
    Cookie: csrfCookie ?? '',
  });

  it('should reject signup without CSRF token', async () => {
    const res = await app.request('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nocrsf@example.com', password: 'SecurePass123!' }),
    });

    const body = (await res.json()) as ApiResponse<UserPayload>;
    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('CSRF_TOKEN_INVALID');
  });

  it('should signup and send verification email', async () => {
    const res = await app.request('/auth/signup', {
      method: 'POST',
      headers: csrfHeaders(),
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
      headers: csrfHeaders(),
      body: JSON.stringify({ token: verificationToken }),
    });

    const body = (await res.json()) as ApiResponse<{ verified: boolean }>;
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('should login after verification and return cookie', async () => {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: csrfHeaders(),
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

  it('should request password reset and capture token', async () => {
    const res = await app.request('/auth/request-password-reset', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ email: 'newuser@example.com' }),
    });

    const body = (await res.json()) as ApiResponse<{ requested: boolean }>;
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    resetToken = emailProvider.resetTokens.at(-1) ?? null;
    expect(resetToken).toBeTruthy();
  });

  it('should reset password and allow login with new password', async () => {
    const res = await app.request('/auth/reset-password', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ token: resetToken, newPassword: 'NewStrongPass!234' }),
    });

    const body = (await res.json()) as ApiResponse<{ reset: boolean }>;
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ email: 'newuser@example.com', password: 'NewStrongPass!234' }),
    });

    const loginBody = (await loginRes.json()) as ApiResponse<UserPayload>;
    expect(loginRes.status).toBe(200);
    expect(loginBody.success).toBe(true);
  });
});
