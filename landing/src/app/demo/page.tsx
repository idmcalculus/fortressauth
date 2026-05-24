import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import { GlobalBackground } from '@/components/GlobalBackground';
import { getLiveDemoUrl } from '@/lib/demo-config';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Live Demo | FortressAuth',
  description: 'Try the FortressAuth React SDK demo from the FortressAuth landing site.',
};

export default function DemoPage() {
  const demoUrl = getLiveDemoUrl();
  const iframeSrc = `${demoUrl}/`;

  return (
    <GlobalBackground>
      <main className={styles.page}>
        <div className={styles.shell}>
          <header className={styles.header}>
            <a href="/en" className={styles.backLink}>
              <ArrowLeft size={18} aria-hidden="true" />
              FortressAuth
            </a>
            <a href={iframeSrc} className={styles.openLink}>
              Open standalone
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </header>

          <section className={styles.hero} aria-labelledby="demo-title">
            <div>
              <p className={styles.eyebrow}>React SDK</p>
              <h1 id="demo-title" className={styles.title}>
                Live Auth Demo
              </h1>
            </div>
            <p className={styles.subtitle}>
              The embedded example runs on the stable React demo subdomain and calls the production
              API with the same auth settings users would configure in an app.
            </p>
          </section>

          <section className={styles.frameSection} aria-label="FortressAuth live demo">
            <iframe
              className={styles.demoFrame}
              src={iframeSrc}
              title="FortressAuth live authentication demo"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </section>
        </div>
      </main>
    </GlobalBackground>
  );
}
