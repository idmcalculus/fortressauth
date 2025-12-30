'use client';

import { useTranslations } from 'next-intl';
import { SiAngular, SiNodedotjs, SiReact, SiSvelte, SiVuedotjs } from 'react-icons/si';
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
];

export function ExamplesShowcase() {
  const t = useTranslations('examples');

  return (
    <section id="examples" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>

        <div className={styles.grid}>
          {examples.map((example) => {
            const Icon = example.icon;
            return (
              <div key={example.id} className={styles.card}>
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
                      href={example.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
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
            );
          })}
        </div>
      </div>
    </section>
  );
}
