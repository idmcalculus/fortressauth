import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('docs');
  return {
    title: `${t('api.title')} | FortressAuth`,
    description: t('api.description'),
  };
}

export default async function ApiReferencePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');

  return (
    <article>
      <h1>{t('api.title')}</h1>
      <p>{t('api.description')}</p>

      <h2>Core Classes</h2>
      <ul>
        <li><a href="/docs/api/fortress-auth">FortressAuth</a> - Main authentication orchestrator</li>
        <li><a href="/docs/api/configuration">Configuration</a> - Configuration options</li>
        <li><a href="/docs/api/error-codes">Error Codes</a> - Error code reference</li>
      </ul>

      <h2>Domain Entities</h2>
      <ul>
        <li><strong>User</strong> - Represents a registered user</li>
        <li><strong>Account</strong> - Links users to authentication providers</li>
        <li><strong>Session</strong> - Represents an active user session</li>
        <li><strong>EmailVerificationToken</strong> - Token for email verification</li>
        <li><strong>PasswordResetToken</strong> - Token for password reset</li>
        <li><strong>LoginAttempt</strong> - Audit record for login attempts</li>
      </ul>

      <h2>Port Interfaces</h2>
      <ul>
        <li><strong>AuthRepository</strong> - Persistence layer interface</li>
        <li><strong>EmailProviderPort</strong> - Email sending interface</li>
        <li><strong>RateLimiterPort</strong> - Rate limiting interface</li>
      </ul>

      <h2>Type Definitions</h2>
      <p>All types are exported from <code>@fortressauth/core</code>:</p>
      <pre><code>{`import type {
  SignUpInput,
  SignInInput,
  ResetPasswordInput,
  AuthResult,
  AuthErrorCode,
  Result,
  FortressConfig,
  FortressConfigInput,
} from '@fortressauth/core';`}</code></pre>
    </article>
  );
}
