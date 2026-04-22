'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { isApiHealthy } from '@/lib/api-config';
import styles from './Documentation.module.css';

const API_PROXY_ORIGIN = '/api/proxy';
const API_DOCS_PROXY_URL = '/api/proxy/docs/';

type DocumentationProps = {
  externalDocsUrl?: string | null;
};

export function Documentation({ externalDocsUrl = API_DOCS_PROXY_URL }: DocumentationProps) {
  const t = useTranslations('documentation');
  const [status, setStatus] = useState<'loading' | 'found' | 'not-found'>(
    process.env.NODE_ENV === 'production' ? 'found' : 'loading',
  );

  const discoverServer = useCallback(async () => {
    if (process.env.NODE_ENV === 'production') {
      setStatus('found');
      return;
    }

    const healthy = await isApiHealthy(fetch, API_PROXY_ORIGIN);
    setStatus(healthy ? 'found' : 'not-found');
  }, []);

  useEffect(() => {
    discoverServer();
  }, [discoverServer]);

  return (
    <section id="docs" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.subtitle}>{t('subtitle')}</p>
          {status === 'found' && externalDocsUrl && (
            <a
              href={externalDocsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              {t('openFullDocs')}
              <ExternalLink
                style={{ width: '16px', height: '16px', color: 'inherit' }}
                aria-hidden="true"
              />
            </a>
          )}
        </div>

        <div className={styles.iframeContainer}>
          {status === 'not-found' ? (
            <div className={styles.fallbackVisible}>
              <div className={styles.fallbackIcon}>📖</div>
              <h3 className={styles.fallbackTitle}>{t('serverNotRunning')}</h3>
              <p className={styles.fallbackText}>{t('fallbackMessage')}</p>
              <div className={styles.codeBlock}>
                <code>pnpm --filter @fortressauth/server dev</code>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatus('loading');
                  discoverServer();
                }}
                className={styles.retryButton}
              >
                Retry
              </button>
            </div>
          ) : status === 'found' ? (
            <iframe
              src={API_DOCS_PROXY_URL}
              title="FortressAuth API Documentation"
              className={styles.iframe}
              loading="lazy"
            />
          ) : (
            <div className={styles.fallbackVisible}>
              <div className={styles.fallbackIcon}>🔍</div>
              <p className={styles.fallbackText}>Discovering API server...</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
