'use client';

import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  SiAngular,
  SiElectron,
  SiExpo,
  SiNodedotjs,
  SiReact,
  SiSvelte,
  SiVuedotjs,
} from 'react-icons/si';
import styles from './ExamplesShowcase.module.css';

const examples = [
  {
    id: 'basic-usage',
    icon: SiNodedotjs,
    techStack: ['Node.js', 'TypeScript', 'SQLite'],
    repoUrl: 'https://github.com/idmcalculus/fortressauth/tree/main/examples/basic-usage',
    demoUrl: null,
  },
  {
    id: 'web-react',
    icon: SiReact,
    techStack: ['React', 'TypeScript', 'Vite'],
    repoUrl: 'https://github.com/idmcalculus/fortressauth/tree/main/examples/web-react',
    demoUrl: '/react-demo',
  },
  {
    id: 'web-vue',
    icon: SiVuedotjs,
    techStack: ['Vue 3', 'TypeScript', 'Vite'],
    repoUrl: 'https://github.com/idmcalculus/fortressauth/tree/main/examples/web-vue',
    demoUrl: '/vue-demo',
  },
  {
    id: 'web-svelte',
    icon: SiSvelte,
    techStack: ['Svelte 5', 'TypeScript', 'Vite'],
    repoUrl: 'https://github.com/idmcalculus/fortressauth/tree/main/examples/web-svelte',
    demoUrl: '/svelte-demo',
  },
  {
    id: 'web-angular',
    icon: SiAngular,
    techStack: ['Angular', 'TypeScript', 'RxJS'],
    repoUrl: 'https://github.com/idmcalculus/fortressauth/tree/main/examples/web-angular',
    demoUrl: '/angular-demo',
  },
  {
    id: 'mobile-expo',
    icon: SiExpo,
    techStack: ['Expo', 'React Native', 'TypeScript'],
    repoUrl: 'https://github.com/idmcalculus/fortressauth/tree/main/examples/mobile-expo',
    demoUrl: null,
  },
  {
    id: 'desktop-electron',
    icon: SiElectron,
    techStack: ['Electron', 'JavaScript', 'Node.js'],
    repoUrl: 'https://github.com/idmcalculus/fortressauth/tree/main/examples/desktop-electron',
    demoUrl: null,
  },
];

export function ExamplesShowcase() {
  const t = useTranslations('examples');
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    slidesToScroll: 1,
    containScroll: 'trimSnaps',
    loop: false,
  });

  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <section id="examples" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>

        <div className={styles.carouselWrapper}>
          <button
            type="button"
            className={`${styles.navButton} ${styles.navButtonPrev}`}
            onClick={scrollPrev}
            disabled={!canScrollPrev}
            aria-label={t('prevSlide')}
          >
            <ChevronLeft size={24} />
          </button>

          <div className={styles.carousel} ref={emblaRef}>
            <div className={styles.carouselContainer}>
              {examples.map((example) => {
                const Icon = example.icon;
                return (
                  <div key={example.id} className={styles.carouselSlide}>
                    <div className={styles.card}>
                      <div className={styles.cardIcon}>
                        <Icon size={40} />
                      </div>
                      <h3 className={styles.cardTitle}>{t(`${example.id}.title`)}</h3>
                      <p className={styles.cardDescription}>{t(`${example.id}.description`)}</p>
                      <div className={styles.techStack}>
                        {example.techStack.map((tech) => (
                          <span key={tech} className={styles.techBadge}>
                            {tech}
                          </span>
                        ))}
                      </div>
                      <div className={styles.cardActions}>
                        {example.demoUrl && (
                          <a
                            href={`${example.demoUrl}/`}
                            className={styles.demoLink}
                          >
                            {t('viewDemo')} →
                          </a>
                        )}
                        <a
                          href={example.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.codeLink}
                        >
                          {t('viewCode')} →
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className={`${styles.navButton} ${styles.navButtonNext}`}
            onClick={scrollNext}
            disabled={!canScrollNext}
            aria-label={t('nextSlide')}
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className={styles.dots}>
          {examples.map((example, index) => (
            <button
              key={example.id}
              type="button"
              className={`${styles.dot} ${index === selectedIndex ? styles.dotActive : ''}`}
              onClick={() => scrollTo(index)}
              aria-label={`${t('goToSlide')} ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
