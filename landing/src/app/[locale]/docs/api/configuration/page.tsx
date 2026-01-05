import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('docs');
  return {
    title: `${t('api.configuration.title')} | FortressAuth`,
    description: t('api.configuration.description'),
  };
}

export default async function ConfigurationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');

  return (
    <article>
      <h1>{t('api.configuration.title')}</h1>
      <p>{t('api.configuration.description')}</p>

      <h2>Full Configuration Example</h2>
      <pre><code>{`import { FortressAuth } from '@fortressauth/core';

const fortress = new FortressAuth(repository, rateLimiter, emailProvider, {
  // Session configuration
  session: {
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days (default)
  },
  
  // Password requirements
  password: {
    minLength: 8,      // default: 8
    maxLength: 128,    // default: 128
    breachedCheck: {
      enabled: false,  // default: false
      threshold: 1,    // reject if found this many times
    },
  },
  
  // Email verification
  emailVerification: {
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours (default)
  },
  
  // Password reset
  passwordReset: {
    ttlMs: 60 * 60 * 1000,     // 1 hour (default)
    maxActiveTokens: 3,        // max active tokens per user
  },
  
  // Account lockout
  lockout: {
    enabled: true,             // default: true
    maxFailedAttempts: 5,      // default: 5
    lockoutDurationMs: 15 * 60 * 1000, // 15 minutes (default)
  },
  
  // Rate limiting
  rateLimit: {
    enabled: true,             // default: true
    endpoints: {
      login: { maxAttempts: 5, windowMs: 60000 },
      signup: { maxAttempts: 3, windowMs: 60000 },
      passwordReset: { maxAttempts: 3, windowMs: 60000 },
      verifyEmail: { maxAttempts: 5, windowMs: 60000 },
    },
  },
  
  // URLs for email links
  urls: {
    baseUrl: 'https://yourdomain.com',
  },
});`}</code></pre>

      <h2>{t('api.configuration.options')}</h2>

      <h3>Session Configuration</h3>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>session.ttlMs</code></td>
            <td><code>number</code></td>
            <td>604800000 (7 days)</td>
            <td>Session token time-to-live in milliseconds</td>
          </tr>
        </tbody>
      </table>

      <h3>Password Configuration</h3>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>password.minLength</code></td>
            <td><code>number</code></td>
            <td>8</td>
            <td>Minimum password length</td>
          </tr>
          <tr>
            <td><code>password.maxLength</code></td>
            <td><code>number</code></td>
            <td>128</td>
            <td>Maximum password length</td>
          </tr>
          <tr>
            <td><code>password.breachedCheck.enabled</code></td>
            <td><code>boolean</code></td>
            <td>false</td>
            <td>Check passwords against Have I Been Pwned</td>
          </tr>
          <tr>
            <td><code>password.breachedCheck.threshold</code></td>
            <td><code>number</code></td>
            <td>1</td>
            <td>Reject if password found this many times in breaches</td>
          </tr>
        </tbody>
      </table>

      <h3>Email Verification Configuration</h3>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>emailVerification.ttlMs</code></td>
            <td><code>number</code></td>
            <td>86400000 (24 hours)</td>
            <td>Email verification token TTL</td>
          </tr>
        </tbody>
      </table>

      <h3>Password Reset Configuration</h3>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>passwordReset.ttlMs</code></td>
            <td><code>number</code></td>
            <td>3600000 (1 hour)</td>
            <td>Password reset token TTL</td>
          </tr>
          <tr>
            <td><code>passwordReset.maxActiveTokens</code></td>
            <td><code>number</code></td>
            <td>3</td>
            <td>Maximum active reset tokens per user</td>
          </tr>
        </tbody>
      </table>

      <h3>Lockout Configuration</h3>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>lockout.enabled</code></td>
            <td><code>boolean</code></td>
            <td>true</td>
            <td>Enable account lockout after failed attempts</td>
          </tr>
          <tr>
            <td><code>lockout.maxFailedAttempts</code></td>
            <td><code>number</code></td>
            <td>5</td>
            <td>Failed attempts before lockout</td>
          </tr>
          <tr>
            <td><code>lockout.lockoutDurationMs</code></td>
            <td><code>number</code></td>
            <td>900000 (15 min)</td>
            <td>Lockout duration in milliseconds</td>
          </tr>
        </tbody>
      </table>

      <h3>Rate Limit Configuration</h3>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>rateLimit.enabled</code></td>
            <td><code>boolean</code></td>
            <td>true</td>
            <td>Enable rate limiting</td>
          </tr>
          <tr>
            <td><code>rateLimit.endpoints.login</code></td>
            <td><code>object</code></td>
            <td>-</td>
            <td>Rate limit config for login endpoint</td>
          </tr>
          <tr>
            <td><code>rateLimit.endpoints.signup</code></td>
            <td><code>object</code></td>
            <td>-</td>
            <td>Rate limit config for signup endpoint</td>
          </tr>
        </tbody>
      </table>

      <h3>URL Configuration</h3>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>urls.baseUrl</code></td>
            <td><code>string</code></td>
            <td>http://localhost:3000</td>
            <td>Base URL for email links</td>
          </tr>
        </tbody>
      </table>

      <h2>Environment Variables</h2>
      <p>When using the HTTP server package, configuration can be set via environment variables:</p>
      <pre><code>{`# Server
PORT=5000
HOST=0.0.0.0
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/auth

# URLs
BASE_URL=https://yourdomain.com
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Email (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxx
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=Your App

# Session
SESSION_TTL_MS=604800000

# Password
PASSWORD_MIN_LENGTH=8
PASSWORD_MAX_LENGTH=128
BREACHED_PASSWORD_CHECK=false

# Lockout
LOCKOUT_ENABLED=true
LOCKOUT_MAX_ATTEMPTS=5
LOCKOUT_DURATION_MS=900000

# Rate Limiting
RATE_LIMIT_ENABLED=true`}</code></pre>

      <h2>TypeScript Types</h2>
      <pre><code>{`import type { FortressConfig, FortressConfigInput } from '@fortressauth/core';

// FortressConfigInput - what you pass to the constructor
// FortressConfig - the resolved config with all defaults applied`}</code></pre>
    </article>
  );
}
