'use client';

import styles from './GlobalBackground.module.css';
import { InteractiveBackground } from './InteractiveBackground';

interface GlobalBackgroundProps {
  children: React.ReactNode;
}

export function GlobalBackground({ children }: GlobalBackgroundProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.background}>
        <InteractiveBackground />
        <div className={styles.gridPattern} aria-hidden="true" />
        <div className={styles.gradient} aria-hidden="true" />
      </div>
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}
