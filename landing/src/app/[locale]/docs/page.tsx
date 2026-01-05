import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('docs');
  return {
    title: `${t('introduction.title')} | FortressAuth`,
    description: t('introduction.description'),
  };
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');

  return (
    <article>
      <h1>{t('introduction.title')}</h1>
      <p>{t('introduction.description')}</p>

      <h2>{t('introduction.whatIs')}</h2>
      <p>{t('introduction.whatIsDescription')}</p>

      <h3>{t('introduction.keyFeatures')}</h3>
      <ul>
        <li><strong>{t('introduction.features.secureByDefault')}</strong> - {t('introduction.features.secureByDefaultDesc')}</li>
        <li><strong>{t('introduction.features.databaseAgnostic')}</strong> - {t('introduction.features.databaseAgnosticDesc')}</li>
        <li><strong>{t('introduction.features.emailAgnostic')}</strong> - {t('introduction.features.emailAgnosticDesc')}</li>
        <li><strong>{t('introduction.features.hexagonal')}</strong> - {t('introduction.features.hexagonalDesc')}</li>
        <li><strong>{t('introduction.features.typeSafe')}</strong> - {t('introduction.features.typeSafeDesc')}</li>
      </ul>

      <h2>{t('introduction.architecture')}</h2>
      <p>{t('introduction.architectureDescription')}</p>

      <h3>{t('introduction.coreComponents')}</h3>
      <ul>
        <li><strong>FortressAuth</strong> - {t('introduction.components.fortressAuth')}</li>
        <li><strong>AuthRepository</strong> - {t('introduction.components.authRepository')}</li>
        <li><strong>EmailProvider</strong> - {t('introduction.components.emailProvider')}</li>
        <li><strong>RateLimiter</strong> - {t('introduction.components.rateLimiter')}</li>
      </ul>

      <h2>{t('introduction.nextSteps')}</h2>
      <ul>
        <li><a href="/docs/installation">{t('introduction.links.installation')}</a></li>
        <li><a href="/docs/quick-start">{t('introduction.links.quickStart')}</a></li>
        <li><a href="/docs/api/fortress-auth">{t('introduction.links.apiReference')}</a></li>
      </ul>
    </article>
  );
}
