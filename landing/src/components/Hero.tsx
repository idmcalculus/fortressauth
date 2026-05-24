'use client';

import { ArrowRight, Database, Lock, Shield, Zap } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import styles from './Hero.module.css';

const highlights = [
  { icon: Shield, key: 'secureByDefault' },
  { icon: Database, key: 'databaseAgnostic' },
  { icon: Zap, key: 'fastIntegration' },
  { icon: Lock, key: 'productionReady' },
];

export function Hero() {
  const t = useTranslations('hero');

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
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

          <h1 id="hero-title" className={styles.title}>
            {t('title')}
          </h1>

          <p className={styles.subtitle}>{t('subtitle')}</p>

          <p className={styles.description}>{t('description')}</p>

          <div className={styles.actions}>
            <a href="/demo" className={styles.primaryButton}>
              {t('tryDemo')}
              <ArrowRight
                style={{ width: '20px', height: '20px', color: 'inherit' }}
                aria-hidden="true"
              />
            </a>

            <a href="#docs" className={styles.secondaryButton}>
              {t('getStarted')}
            </a>

            <a href="/docs" className={styles.tertiaryButton}>
              {t('viewDocs')}
            </a>
          </div>

          {/* Feature Highlights Grid */}
          <div className={styles.highlights}>
            {highlights.map(({ icon: Icon, key }) => (
              <div key={key} className={styles.highlight}>
                <div className={styles.highlightIcon}>
                  <Icon
                    style={{ width: '24px', height: '24px', color: 'var(--color-accent)' }}
                    aria-hidden="true"
                  />
                </div>
                <div className={styles.highlightContent}>
                  <h3 className={styles.highlightTitle}>{t(`highlights.${key}.title`)}</h3>
                  <p className={styles.highlightDescription}>
                    {t(`highlights.${key}.description`)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>100%</div>
              <div className={styles.statLabel}>{t('stats.typeSafe')}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>0</div>
              <div className={styles.statLabel}>{t('stats.coreDeps')}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>3</div>
              <div className={styles.statLabel}>{t('stats.databases')}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
