'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import styles from './Hero.module.css';

export function Hero() {
  const t = useTranslations('hero');

  return (
    <section className={styles.hero}>
      <div className={styles.background}>
        <div className={styles.gridPattern}></div>
        <div className={styles.gradient}></div>
      </div>

      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.logoContainer}>
            <Image
              src="/logo.svg"
              alt="FortressAuth Logo"
              width={120}
              height={120}
              className={styles.logo}
              priority
            />
          </div>

          <h1 className={styles.title}>{t('title')}</h1>

          <p className={styles.subtitle}>{t('subtitle')}</p>

          <p className={styles.description}>{t('description')}</p>

          <div className={styles.actions}>
            <a href="#docs" className={styles.primaryButton}>
              {t('getStarted')}
              <ArrowRight
                style={{ width: '20px', height: '20px', color: 'inherit' }}
              />
            </a>

            <a href="#examples" className={styles.secondaryButton}>
              {t('viewDocs')}
            </a>

            <a
              href="https://github.com/idmcalculus/fortressauth"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.tertiaryButton}
            >
              {t('tryDemo')}
              <ExternalLink
                style={{ width: '18px', height: '18px', color: 'inherit' }}
              />
            </a>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>100%</div>
              <div className={styles.statLabel}>Type Safe</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>0</div>
              <div className={styles.statLabel}>Core Dependencies</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>3</div>
              <div className={styles.statLabel}>Databases Supported</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}