'use client';

import {
  BadgeCheck,
  Code,
  Database,
  FileText,
  Layers,
  Mail,
  Package,
  Shield,
} from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import styles from './Features.module.css';

const features = [
  { icon: Shield, key: 'secureByDefault', color: '#4ecdc4' },
  { icon: Database, key: 'databaseAgnostic', color: '#45b7aa' },
  { icon: Mail, key: 'emailAgnostic', color: '#3da192' },
  { icon: BadgeCheck, key: 'productionReady', color: '#358b7a' },
  { icon: FileText, key: 'openApiDocs', color: '#3da192' },
  { icon: Package, key: 'dockerReady', color: '#45b7aa' },
  { icon: Code, key: 'sdks', color: '#4ecdc4' },
  { icon: Layers, key: 'hexagonal', color: '#45b7aa' },
];

export function Features() {
  const t = useTranslations('features');
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const animationRef = useRef<number | null>(null);

  // Rotation animation
  useEffect(() => {
    if (isPaused) return;

    const animate = () => {
      setRotation((prev) => (prev + 0.15) % 360);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPaused]);

  const handleCardHover = (index: number | null) => {
    setActiveIndex(index);
    setIsPaused(index !== null);
  };

  const getCardPosition = (index: number, total: number) => {
    const angle = (index / total) * 360 + rotation;
    const radian = (angle * Math.PI) / 180;
    const radius = 38; // percentage from center
    const x = 50 + radius * Math.cos(radian);
    const y = 50 + radius * Math.sin(radian);
    return { x, y, angle };
  };

  return (
    <section
      id="features"
      className={styles.features}
      aria-labelledby="features-title"
      ref={containerRef}
    >

      <div className={styles.header}>
        <h2 id="features-title" className={styles.title}>
          {t('title')}
        </h2>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </div>

      <div className={styles.orbitContainer}>
        {/* Center logo */}
        <div className={`${styles.centerLogo} ${activeIndex !== null ? styles.centerLogoShrink : ''}`}>
          <Image
            src="/logo.svg"
            alt="FortressAuth"
            width={120}
            height={120}
            className={styles.logoImage}
          />
        </div>

        {/* Orbit ring */}
        <div className={styles.orbitRing} />

        {/* Feature cards */}
        {features.map((feature, index) => {
          const { x, y } = getCardPosition(index, features.length);
          const Icon = feature.icon;
          const isActive = activeIndex === index;

          return (
            <div
              key={feature.key}
              className={`${styles.featureCard} ${isActive ? styles.featureCardActive : ''}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%, -50%) ${isActive ? 'scale(1.4)' : 'scale(1)'}`,
                zIndex: isActive ? 10 : 1,
              }}
              onMouseEnter={() => handleCardHover(index)}
              onMouseLeave={() => handleCardHover(null)}
            >
              <div className={styles.cardInner}>
                <div className={styles.iconWrapper} style={{ background: `${feature.color}20` }}>
                  <Icon
                    style={{
                      width: '24px',
                      height: '24px',
                      color: feature.color,
                    }}
                    aria-hidden="true"
                  />
                </div>
                <h3 className={styles.cardTitle}>{t(`${feature.key}.title`)}</h3>
                {isActive && (
                  <p className={styles.cardDescription}>{t(`${feature.key}.description`)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active feature detail panel */}
      {activeIndex !== null && features[activeIndex] && (
        <div className={styles.detailPanel}>
          <div className={styles.detailContent}>
            {(() => {
              const feature = features[activeIndex];
              const Icon = feature.icon;
              return (
                <>
                  <Icon
                    style={{
                      width: '32px',
                      height: '32px',
                      color: feature.color,
                    }}
                  />
                  <div>
                    <h4 className={styles.detailTitle}>{t(`${feature.key}.title`)}</h4>
                    <p className={styles.detailDescription}>{t(`${feature.key}.description`)}</p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
}
