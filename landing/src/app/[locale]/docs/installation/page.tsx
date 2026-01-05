import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('docs');
  return {
    title: `${t('installation.title')} | FortressAuth`,
    description: t('installation.description'),
  };
}

export default async function InstallationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');

  return (
    <article>
      <h1>{t('installation.title')}</h1>
      <p>{t('installation.description')}</p>

      <h2>{t('installation.prerequisites')}</h2>
      <p>{t('installation.prerequisitesDesc')}</p>
      <ul>
        <li>{t('installation.prereqNode')}</li>
        <li>{t('installation.prereqPackageManager')}</li>
        <li>{t('installation.prereqDatabase')}</li>
      </ul>

      <h2>{t('installation.corePackage')}</h2>
      <p>{t('installation.corePackageDesc')}</p>
      <pre>
        <code>{`# Using npm
npm install @fortressauth/core

# Using yarn
yarn add @fortressauth/core

# Using pnpm
pnpm add @fortressauth/core`}</code>
      </pre>

      <p>The core package includes:</p>
      <ul>
        <li>
          <code>FortressAuth</code> - Main authentication orchestrator
        </li>
        <li>
          <code>ConsoleEmailProvider</code> - Development email provider (logs to console)
        </li>
        <li>All domain entities and types</li>
        <li>Zod schemas for validation</li>
      </ul>

      <h2>{t('installation.databaseAdapter')}</h2>
      <p>{t('installation.databaseAdapterDesc')}</p>
      <pre>
        <code>{`# Using npm
npm install @fortressauth/adapter-sql

# Using yarn
yarn add @fortressauth/adapter-sql

# Using pnpm
pnpm add @fortressauth/adapter-sql`}</code>
      </pre>

      <p>The SQL adapter supports:</p>
      <ul>
        <li>
          <strong>PostgreSQL</strong> - Recommended for production
        </li>
        <li>
          <strong>MySQL</strong> - Full support with InnoDB
        </li>
        <li>
          <strong>SQLite</strong> - Great for development and small deployments
        </li>
      </ul>

      <p>You&apos;ll also need to install a database driver:</p>
      <pre>
        <code>{`# For PostgreSQL
npm install pg

# For MySQL
npm install mysql2

# For SQLite
npm install better-sqlite3`}</code>
      </pre>

      <h2>{t('installation.httpServer')}</h2>
      <p>{t('installation.httpServerDesc')}</p>
      <pre>
        <code>{`# Using npm
npm install @fortressauth/server

# Using yarn
yarn add @fortressauth/server

# Using pnpm
pnpm add @fortressauth/server`}</code>
      </pre>

      <p>The server package provides:</p>
      <ul>
        <li>RESTful API endpoints for all auth operations</li>
        <li>OpenAPI documentation with Scalar UI</li>
        <li>CORS configuration</li>
        <li>Cookie-based session management</li>
        <li>Health check endpoints</li>
      </ul>

      <h2>{t('installation.clientSdks')}</h2>
      <p>{t('installation.clientSdksDesc')}</p>
      <pre>
        <code>{`# React
npm install @fortressauth/react-sdk

# Vue
npm install @fortressauth/vue-sdk

# Angular
npm install @fortressauth/angular-sdk

# Svelte
npm install @fortressauth/svelte-sdk

# React Native / Expo
npm install @fortressauth/expo-sdk

# Electron
npm install @fortressauth/electron-sdk`}</code>
      </pre>

      <h2>Email Providers (Optional)</h2>
      <p>For production email delivery, install one of the email provider packages:</p>
      <pre>
        <code>{`# AWS SES
npm install @fortressauth/email-ses

# SendGrid
npm install @fortressauth/email-sendgrid

# SMTP (Nodemailer)
npm install @fortressauth/email-smtp`}</code>
      </pre>

      <h2>TypeScript Configuration</h2>
      <p>
        FortressAuth is written in TypeScript and provides full type definitions. Ensure your{' '}
        <code>tsconfig.json</code> includes:
      </p>
      <pre>
        <code>{`{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true
  }
}`}</code>
      </pre>

      <h2>{t('installation.nextSteps')}</h2>
      <p>{t('installation.nextStepsDesc')}</p>
      <ul>
        <li>
          <a href="/docs/quick-start">{t('quickStart.title')}</a> - Set up your first authentication
          flow
        </li>
        <li>
          <a href="/docs/api/fortress-auth">API Reference</a> - Explore all available methods
        </li>
        <li>
          <a href="/docs/api/configuration">Configuration</a> - Customize FortressAuth for your
          needs
        </li>
      </ul>
    </article>
  );
}
