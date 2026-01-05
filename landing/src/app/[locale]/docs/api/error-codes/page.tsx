import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('docs');
  return {
    title: `${t('api.errorCodes.title')} | FortressAuth`,
    description: t('api.errorCodes.description'),
  };
}

export default async function ErrorCodesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');

  return (
    <article>
      <h1>{t('api.errorCodes.title')}</h1>
      <p>{t('api.errorCodes.description')}</p>

      <h2>Error Code Reference</h2>
      <p>All FortressAuth operations return a <code>Result</code> type. When an operation fails, 
      the <code>error</code> field contains one of the following error codes:</p>

      <h3>Authentication Errors</h3>
      <table>
        <thead>
          <tr>
            <th>Error Code</th>
            <th>HTTP Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>INVALID_CREDENTIALS</code></td>
            <td>401</td>
            <td>The email or password is incorrect</td>
          </tr>
          <tr>
            <td><code>ACCOUNT_LOCKED</code></td>
            <td>401</td>
            <td>Account is temporarily locked due to failed login attempts</td>
          </tr>
          <tr>
            <td><code>EMAIL_NOT_VERIFIED</code></td>
            <td>403</td>
            <td>Email address has not been verified</td>
          </tr>
        </tbody>
      </table>

      <h3>Registration Errors</h3>
      <table>
        <thead>
          <tr>
            <th>Error Code</th>
            <th>HTTP Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>EMAIL_EXISTS</code></td>
            <td>400</td>
            <td>Email address is already registered</td>
          </tr>
          <tr>
            <td><code>PASSWORD_TOO_WEAK</code></td>
            <td>400</td>
            <td>Password does not meet requirements (length, breached check)</td>
          </tr>
          <tr>
            <td><code>INVALID_INPUT</code></td>
            <td>400</td>
            <td>Invalid email format or input contains forbidden characters</td>
          </tr>
        </tbody>
      </table>

      <h3>Session Errors</h3>
      <table>
        <thead>
          <tr>
            <th>Error Code</th>
            <th>HTTP Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>SESSION_INVALID</code></td>
            <td>401</td>
            <td>Session token is malformed or does not exist</td>
          </tr>
          <tr>
            <td><code>SESSION_EXPIRED</code></td>
            <td>401</td>
            <td>Session token has expired</td>
          </tr>
        </tbody>
      </table>

      <h3>Email Verification Errors</h3>
      <table>
        <thead>
          <tr>
            <th>Error Code</th>
            <th>HTTP Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>EMAIL_VERIFICATION_INVALID</code></td>
            <td>400</td>
            <td>Verification token is invalid or has been used</td>
          </tr>
          <tr>
            <td><code>EMAIL_VERIFICATION_EXPIRED</code></td>
            <td>410</td>
            <td>Verification token has expired</td>
          </tr>
        </tbody>
      </table>

      <h3>Password Reset Errors</h3>
      <table>
        <thead>
          <tr>
            <th>Error Code</th>
            <th>HTTP Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>PASSWORD_RESET_INVALID</code></td>
            <td>400</td>
            <td>Reset token is invalid or has been used</td>
          </tr>
          <tr>
            <td><code>PASSWORD_RESET_EXPIRED</code></td>
            <td>410</td>
            <td>Reset token has expired</td>
          </tr>
        </tbody>
      </table>

      <h3>Rate Limiting Errors</h3>
      <table>
        <thead>
          <tr>
            <th>Error Code</th>
            <th>HTTP Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>RATE_LIMIT_EXCEEDED</code></td>
            <td>429</td>
            <td>Too many requests, try again later</td>
          </tr>
        </tbody>
      </table>

      <h3>System Errors</h3>
      <table>
        <thead>
          <tr>
            <th>Error Code</th>
            <th>HTTP Status</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>INTERNAL_ERROR</code></td>
            <td>500</td>
            <td>An unexpected error occurred</td>
          </tr>
        </tbody>
      </table>

      <h2>Handling Errors</h2>
      <p>Use TypeScript&apos;s type narrowing to handle errors:</p>
      <pre><code>{`const result = await fortress.signIn({ email, password });

if (!result.success) {
  switch (result.error) {
    case 'INVALID_CREDENTIALS':
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    
    case 'ACCOUNT_LOCKED':
      return res.status(401).json({ 
        error: 'Account is locked. Try again later.' 
      });
    
    case 'EMAIL_NOT_VERIFIED':
      return res.status(403).json({ 
        error: 'Please verify your email first' 
      });
    
    case 'RATE_LIMIT_EXCEEDED':
      return res.status(429).json({ 
        error: 'Too many attempts. Try again later.' 
      });
    
    default:
      return res.status(500).json({ 
        error: 'An error occurred' 
      });
  }
}

// Success - result.data is available
const { user, token } = result.data;`}</code></pre>

      <h2>Production Error Messages</h2>
      <p>In production, error messages should be generic to prevent information leakage:</p>
      <pre><code>{`// Development - detailed errors
{
  "success": false,
  "error": "INVALID_CREDENTIALS",
  "details": "Password verification failed for user@example.com"
}

// Production - generic errors
{
  "success": false,
  "error": "INVALID_CREDENTIALS",
  "message": "Authentication failed. Please check your credentials.",
  "code": "AUTH_001"
}`}</code></pre>

      <h2>Error Code to HTTP Status Mapping</h2>
      <pre><code>{`const errorStatusMap: Record<AuthErrorCode, number> = {
  EMAIL_EXISTS: 400,
  INVALID_CREDENTIALS: 401,
  PASSWORD_TOO_WEAK: 400,
  ACCOUNT_LOCKED: 401,
  EMAIL_NOT_VERIFIED: 403,
  SESSION_INVALID: 401,
  SESSION_EXPIRED: 401,
  EMAIL_VERIFICATION_INVALID: 400,
  EMAIL_VERIFICATION_EXPIRED: 410,
  PASSWORD_RESET_INVALID: 400,
  PASSWORD_RESET_EXPIRED: 410,
  RATE_LIMIT_EXCEEDED: 429,
  INVALID_INPUT: 400,
  INTERNAL_ERROR: 500,
};`}</code></pre>

      <h2>TypeScript Type</h2>
      <pre><code>{`type AuthErrorCode =
  | 'EMAIL_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'PASSWORD_TOO_WEAK'
  | 'ACCOUNT_LOCKED'
  | 'EMAIL_NOT_VERIFIED'
  | 'SESSION_INVALID'
  | 'SESSION_EXPIRED'
  | 'EMAIL_VERIFICATION_INVALID'
  | 'EMAIL_VERIFICATION_EXPIRED'
  | 'PASSWORD_RESET_INVALID'
  | 'PASSWORD_RESET_EXPIRED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_INPUT'
  | 'INTERNAL_ERROR';`}</code></pre>
    </article>
  );
}
