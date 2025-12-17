'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import styles from './Documentation.module.css';

// Ports to try - 3001 first since server often falls back there when landing uses 3000
const PORTS_TO_TRY = [3001, 3000, 3002, 3003];
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
					const data = await response.json();
					// Verify it's our FortressAuth server by checking the response
					if (data.status === 'ok') {
						setDocsUrl(`http://localhost:${port}/docs`);
						setStatus('found');
						return;
					}
				}
			} catch {
				// Port not available, try next
				continue;
			}
		}

		// No server found
		setStatus('not-found');
		setDocsUrl(`http://localhost:3001/docs`);
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
							{t('openFullDocs')} ↗
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
								onClick={() => { setStatus('loading'); discoverServer(); }}
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


