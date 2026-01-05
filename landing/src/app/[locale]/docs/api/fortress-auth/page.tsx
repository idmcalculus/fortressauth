import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('docs');
  return {
    title: `${t('api.fortressAuth.title')} | FortressAuth`,
    description: t('api.fortressAuth.description'),
  };
}

export default async function FortressAuthApiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');

  return (
    <article>
      <h1>{t('api.fortressAuth.title')}</h1>
      <p>{t('api.fortressAuth.description')}</p>

      <h2>{t('api.fortressAuth.constructor')}</h2>
      <p>{t('api.fortressAuth.constructorDesc')}</p>
      <pre>
        <code>{`import { FortressAuth } from '@fortressauth/core';

const fortress = new FortressAuth(
  repository: AuthRepository,
  rateLimiter: RateLimiterPort,
  emailProvider: EmailProviderPort,
  config?: FortressConfigInput
);`}</code>
      </pre>

      <h3>Parameters</h3>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>repository</code>
            </td>
            <td>
              <code>AuthRepository</code>
            </td>
            <td>Database adapter implementing the AuthRepository interface</td>
          </tr>
          <tr>
            <td>
              <code>rateLimiter</code>
            </td>
            <td>
              <code>RateLimiterPort</code>
            </td>
            <td>Rate limiter implementation (memory or Redis)</td>
          </tr>
          <tr>
            <td>
              <code>emailProvider</code>
            </td>
            <td>
              <code>EmailProviderPort</code>
            </td>
            <td>Email provider for sending verification and reset emails</td>
          </tr>
          <tr>
            <td>
              <code>config</code>
            </td>
            <td>
              <code>FortressConfigInput</code>
            </td>
            <td>Optional configuration overrides</td>
          </tr>
        </tbody>
      </table>

      <h2>{t('api.fortressAuth.methods')}</h2>

      <h3>signUp(input)</h3>
      <p>{t('api.fortressAuth.signUpDesc')}</p>
      <pre>
        <code>{`interface SignUpInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

const result = await fortress.signUp({
  email: 'user@example.com',
  password: 'securePassword123',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0...',
});

// Returns: Result<AuthResult, AuthErrorCode>
// Success: { success: true, data: { user: User, token: string } }
// Error: { success: false, error: AuthErrorCode }`}</code>
      </pre>

      <h4>Possible Errors</h4>
      <ul>
        <li>
          <code>EMAIL_EXISTS</code> - Email already registered
        </li>
        <li>
          <code>PASSWORD_TOO_WEAK</code> - Password doesn&apos;t meet requirements
        </li>
        <li>
          <code>RATE_LIMIT_EXCEEDED</code> - Too many signup attempts
        </li>
        <li>
          <code>INVALID_INPUT</code> - Invalid email format or input
        </li>
      </ul>

      <h3>signIn(input)</h3>
      <p>{t('api.fortressAuth.signInDesc')}</p>
      <pre>
        <code>{`interface SignInInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

const result = await fortress.signIn({
  email: 'user@example.com',
  password: 'securePassword123',
  ipAddress: '127.0.0.1',
});

// Returns: Result<AuthResult, AuthErrorCode>`}</code>
      </pre>

      <h4>Possible Errors</h4>
      <ul>
        <li>
          <code>INVALID_CREDENTIALS</code> - Wrong email or password
        </li>
        <li>
          <code>ACCOUNT_LOCKED</code> - Account locked due to failed attempts
        </li>
        <li>
          <code>EMAIL_NOT_VERIFIED</code> - Email not yet verified
        </li>
        <li>
          <code>RATE_LIMIT_EXCEEDED</code> - Too many login attempts
        </li>
      </ul>

      <h3>validateSession(rawToken)</h3>
      <p>{t('api.fortressAuth.validateSessionDesc')}</p>
      <pre>
        <code>{`const result = await fortress.validateSession(token);

// Returns: Result<{ user: User, session: Session }, AuthErrorCode>

if (result.success) {
  const { user, session } = result.data;
  console.log('User:', user.email);
  console.log('Session expires:', session.expiresAt);
}`}</code>
      </pre>

      <h4>Possible Errors</h4>
      <ul>
        <li>
          <code>SESSION_INVALID</code> - Token is malformed or doesn&apos;t exist
        </li>
        <li>
          <code>SESSION_EXPIRED</code> - Session has expired
        </li>
      </ul>

      <h3>signOut(rawToken)</h3>
      <p>{t('api.fortressAuth.signOutDesc')}</p>
      <pre>
        <code>{`const result = await fortress.signOut(token);

// Returns: Result<void, AuthErrorCode>`}</code>
      </pre>

      <h4>Possible Errors</h4>
      <ul>
        <li>
          <code>SESSION_INVALID</code> - Token is invalid
        </li>
      </ul>

      <h3>verifyEmail(token, context?)</h3>
      <p>{t('api.fortressAuth.verifyEmailDesc')}</p>
      <pre>
        <code>{`const result = await fortress.verifyEmail(token, {
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0...',
});

// Returns: Result<void, AuthErrorCode>`}</code>
      </pre>

      <h4>Possible Errors</h4>
      <ul>
        <li>
          <code>EMAIL_VERIFICATION_INVALID</code> - Token is invalid
        </li>
        <li>
          <code>EMAIL_VERIFICATION_EXPIRED</code> - Token has expired
        </li>
        <li>
          <code>RATE_LIMIT_EXCEEDED</code> - Too many verification attempts
        </li>
      </ul>

      <h3>requestPasswordReset(email)</h3>
      <p>{t('api.fortressAuth.requestPasswordResetDesc')}</p>
      <pre>
        <code>{`const result = await fortress.requestPasswordReset('user@example.com');

// Returns: Result<void, AuthErrorCode>
// Always returns success to prevent email enumeration`}</code>
      </pre>

      <div className="note">
        <strong>Security Note:</strong> This method always returns success, even if the email
        doesn&apos;t exist. This prevents attackers from discovering which emails are registered.
      </div>

      <h3>resetPassword(input)</h3>
      <p>{t('api.fortressAuth.resetPasswordDesc')}</p>
      <pre>
        <code>{`interface ResetPasswordInput {
  token: string;
  newPassword: string;
  ipAddress?: string;
  userAgent?: string;
}

const result = await fortress.resetPassword({
  token: 'reset-token-from-email',
  newPassword: 'newSecurePassword123',
  ipAddress: '127.0.0.1',
});

// Returns: Result<void, AuthErrorCode>`}</code>
      </pre>

      <h4>Possible Errors</h4>
      <ul>
        <li>
          <code>PASSWORD_RESET_INVALID</code> - Token is invalid
        </li>
        <li>
          <code>PASSWORD_RESET_EXPIRED</code> - Token has expired
        </li>
        <li>
          <code>PASSWORD_TOO_WEAK</code> - New password doesn&apos;t meet requirements
        </li>
        <li>
          <code>RATE_LIMIT_EXCEEDED</code> - Too many reset attempts
        </li>
      </ul>

      <div className="note">
        <strong>Note:</strong> A successful password reset invalidates all existing sessions for the
        user, requiring them to sign in again.
      </div>

      <h3>getConfig()</h3>
      <p>{t('api.fortressAuth.getConfigDesc')}</p>
      <pre>
        <code>{`const config = fortress.getConfig();

// Returns: Readonly<FortressConfig>
console.log(config.session.ttlMs);
console.log(config.password.minLength);`}</code>
      </pre>

      <h2>Type Definitions</h2>

      <h3>AuthResult</h3>
      <pre>
        <code>{`interface AuthResult {
  user: User;
  token: string;
}`}</code>
      </pre>

      <h3>User</h3>
      <pre>
        <code>{`interface User {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lockedUntil: Date | null;
  
  isLocked(): boolean;
}`}</code>
      </pre>

      <h3>Session</h3>
      <pre>
        <code>{`interface Session {
  readonly id: string;
  readonly userId: string;
  readonly selector: string;
  readonly verifierHash: string;
  readonly expiresAt: Date;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly createdAt: Date;
  
  isExpired(): boolean;
}`}</code>
      </pre>

      <h3>Result Type</h3>
      <pre>
        <code>{`type Result<T, E> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Usage:
if (result.success) {
  // TypeScript knows result.data exists
  console.log(result.data);
} else {
  // TypeScript knows result.error exists
  console.error(result.error);
}`}</code>
      </pre>
    </article>
  );
}
