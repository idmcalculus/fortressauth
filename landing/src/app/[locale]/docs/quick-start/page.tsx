import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('docs');
  return {
    title: `${t('quickStart.title')} | FortressAuth`,
    description: t('quickStart.description'),
  };
}

export default async function QuickStartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');

  return (
    <article>
      <h1>{t('quickStart.title')}</h1>
      <p>{t('quickStart.description')}</p>

      <h2>{t('quickStart.overview')}</h2>
      <p>{t('quickStart.overviewDesc')}</p>

      <div className="note">
        <strong>Note:</strong> This guide assumes you have already installed the required packages.
        If not, see the <a href="/docs/installation">Installation guide</a> first.
      </div>

      <h2>{t('quickStart.step1')}</h2>
      <p>{t('quickStart.step1Desc')}</p>
      <pre>
        <code>{`import { SqlAdapter } from '@fortressauth/adapter-sql';
import SQLite from 'better-sqlite3';

// Create a SQLite database (or use PostgreSQL/MySQL)
const db = new SQLite('auth.db');

// Create the SQL adapter
const adapter = new SqlAdapter({
  dialect: 'sqlite',
  database: db,
});

// Run migrations to create tables
await adapter.migrate();`}</code>
      </pre>

      <h3>PostgreSQL Example</h3>
      <pre>
        <code>{`import { SqlAdapter } from '@fortressauth/adapter-sql';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new SqlAdapter({
  dialect: 'postgres',
  pool,
});

await adapter.migrate();`}</code>
      </pre>

      <h2>{t('quickStart.step2')}</h2>
      <p>{t('quickStart.step2Desc')}</p>
      <pre>
        <code>{`import { FortressAuth, ConsoleEmailProvider } from '@fortressauth/core';

const fortress = new FortressAuth({
  repository: adapter,
  emailProvider: new ConsoleEmailProvider(), // Logs emails to console
  config: {
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    passwordMinLength: 8,
    passwordMaxLength: 128,
    requireEmailVerification: true,
    lockoutEnabled: true,
    lockoutThreshold: 5,
    lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
  },
});`}</code>
      </pre>

      <h3>Production Configuration</h3>
      <p>For production, use a real email provider:</p>
      <pre>
        <code>{`import { ResendEmailProvider } from '@fortressauth/server';

const emailProvider = new ResendEmailProvider({
  apiKey: process.env.RESEND_API_KEY,
  fromEmail: 'noreply@yourdomain.com',
  fromName: 'Your App',
});

const fortress = new FortressAuth({
  repository: adapter,
  emailProvider,
  config: {
    // ... your config
  },
});`}</code>
      </pre>

      <h2>{t('quickStart.step3')}</h2>
      <p>{t('quickStart.step3Desc')}</p>
      <pre>
        <code>{`const result = await fortress.signUp({
  email: 'user@example.com',
  password: 'securePassword123',
  ipAddress: '127.0.0.1', // Optional: for audit logging
  userAgent: 'Mozilla/5.0...', // Optional: for session metadata
});

if (result.success) {
  console.log('User created:', result.data.user);
  console.log('Session token:', result.data.token);
  // A verification email will be sent automatically
} else {
  // Handle errors
  switch (result.error) {
    case 'EMAIL_EXISTS':
      console.error('Email already registered');
      break;
    case 'PASSWORD_TOO_WEAK':
      console.error('Password does not meet requirements');
      break;
    case 'RATE_LIMIT_EXCEEDED':
      console.error('Too many attempts, try again later');
      break;
    default:
      console.error('Sign up failed:', result.error);
  }
}`}</code>
      </pre>

      <h2>{t('quickStart.step4')}</h2>
      <p>{t('quickStart.step4Desc')}</p>
      <pre>
        <code>{`const result = await fortress.signIn({
  email: 'user@example.com',
  password: 'securePassword123',
  ipAddress: '127.0.0.1',
});

if (result.success) {
  console.log('Signed in:', result.data.user);
  
  // Store the token in a secure HttpOnly cookie
  // Example with Express.js:
  res.cookie('session', result.data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
} else {
  // Handle errors
  switch (result.error) {
    case 'INVALID_CREDENTIALS':
      console.error('Invalid email or password');
      break;
    case 'ACCOUNT_LOCKED':
      console.error('Account is locked, try again later');
      break;
    case 'EMAIL_NOT_VERIFIED':
      console.error('Please verify your email first');
      break;
    default:
      console.error('Sign in failed:', result.error);
  }
}`}</code>
      </pre>

      <h2>{t('quickStart.step5')}</h2>
      <p>{t('quickStart.step5Desc')}</p>
      <pre>
        <code>{`// Get the token from the cookie
const token = req.cookies.session;

if (!token) {
  return res.status(401).json({ error: 'Not authenticated' });
}

const result = await fortress.validateSession(token);

if (result.success) {
  // User is authenticated
  const { user, session } = result.data;
  console.log('Authenticated user:', user.email);
  console.log('Session expires:', session.expiresAt);
  
  // Proceed with the request
  req.user = user;
  next();
} else {
  // Session is invalid or expired
  res.clearCookie('session');
  return res.status(401).json({ error: result.error });
}`}</code>
      </pre>

      <h2>Email Verification</h2>
      <p>When a user clicks the verification link in their email:</p>
      <pre>
        <code>{`// The token comes from the URL query parameter
const token = req.query.token;

const result = await fortress.verifyEmail(token);

if (result.success) {
  console.log('Email verified successfully!');
  // Redirect to login page
} else {
  switch (result.error) {
    case 'EMAIL_VERIFICATION_INVALID':
      console.error('Invalid verification token');
      break;
    case 'EMAIL_VERIFICATION_EXPIRED':
      console.error('Verification token has expired');
      break;
  }
}`}</code>
      </pre>

      <h2>Password Reset</h2>
      <p>Implement password reset in two steps:</p>
      <pre>
        <code>{`// Step 1: Request password reset
const result = await fortress.requestPasswordReset('user@example.com');
// Always returns success to prevent email enumeration

// Step 2: Reset password with token from email
const resetResult = await fortress.resetPassword({
  token: req.body.token,
  newPassword: req.body.newPassword,
});

if (resetResult.success) {
  console.log('Password reset successfully!');
  // All existing sessions are invalidated
} else {
  console.error('Password reset failed:', resetResult.error);
}`}</code>
      </pre>

      <h2>Sign Out</h2>
      <p>Invalidate the user&apos;s session:</p>
      <pre>
        <code>{`const token = req.cookies.session;
await fortress.signOut(token);

// Clear the session cookie
res.clearCookie('session');
res.json({ success: true });`}</code>
      </pre>

      <h2>{t('quickStart.whatNext')}</h2>
      <p>{t('quickStart.whatNextDesc')}</p>
      <ul>
        <li>
          <a href="/docs/api/fortress-auth">API Reference</a> - Complete method documentation
        </li>
        <li>
          <a href="/docs/api/configuration">Configuration Options</a> - Customize behavior
        </li>
        <li>
          <a href="/docs/security/rate-limiting">Rate Limiting</a> - Protect against brute force
        </li>
        <li>
          <a href="/docs/sdks/react">React SDK</a> - Frontend integration
        </li>
        <li>
          <a href="/docs/deployment/docker">Docker Deployment</a> - Production setup
        </li>
      </ul>
    </article>
  );
}
