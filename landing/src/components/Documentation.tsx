'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import styles from './Documentation.module.css';

// Ports to try - server starts at 5000 and increments if port is busy (up to +10)
const PORTS_TO_TRY = [5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010];
const BASE_URL = process.env.NEXT_PUBLIC_DOCS_URL || null;

export function Documentation() {
  const t = useTranslations('documentation');
  const [docsUrl, setDocsUrl] = useState<string | null>(BASE_URL);
  const [status, setStatus] = useState<'loading' | 'found' | 'not-found'>('loading');

  const discoverServer = useCallback(async () => {
    // If a specific URL is configured via env var, use it
    if (BASE_URL) {
      setDocsUrl(BASE_URL);
      setStatus('found');
      return;
    }

    // Try to find the server on common ports
    for (const port of PORTS_TO_TRY) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = (await response.json()) as { status?: string };
          // Verify it's our FortressAuth server by checking the response
          if (data.status === 'ok') {
            setDocsUrl(`http://localhost:${port}/docs`);
            setStatus('found');
            return;
          }
        }
      } catch {}
    }

    // No server found - default to port 5000
    setStatus('not-found');
    setDocsUrl(`http://localhost:5000/docs`);
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
          {docsUrl && (
            <a
              href={docsUrl}
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
          ) : status === 'found' && docsUrl ? (
            <iframe
              src={docsUrl}
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
