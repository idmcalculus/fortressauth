'use client';

import { BadgeCheck, Code, Database, FileText, Layers, Mail, Package, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import styles from './Features.module.css';

const features = [
  { icon: Shield, key: 'secureByDefault' },
  { icon: Database, key: 'databaseAgnostic' },
  { icon: Mail, key: 'emailAgnostic' },
  { icon: BadgeCheck, key: 'productionReady' },
  { icon: FileText, key: 'openApiDocs' },
  { icon: Package, key: 'dockerReady' },
  { icon: Code, key: 'sdks' },
  { icon: Layers, key: 'hexagonal' },
];

export function Features() {
  const t = useTranslations('features');

  return (
    <section id="features" className={styles.features}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('title')}</h2>
        </div>

        <div className={styles.grid}>
          {features.map(({ icon: Icon, key }) => (
            <div key={key} className={styles.card}>
              <div className={styles.iconWrapper}>
                <Icon
                  style={{
                    width: '32px',
                    height: '32px',
                    color: 'var(--color-accent)',
                  }}
                />
              </div>
              <h3 className={styles.cardTitle}>{t(`${key}.title`)}</h3>
              <p className={styles.cardDescription}>{t(`${key}.description`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
