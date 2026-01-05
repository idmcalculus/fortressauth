'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.content}>
          {/* Copyright */}
          <div className={styles.copyright}>
            <span className={styles.copyrightText}>
              © 2026 JaydeeTech Ltd. All rights reserved.
            </span>
          </div>

          {/* Credits */}
          <div className={styles.credits}>
            <span className={styles.madeWith}>
              Developed with{' '}
              <span className={styles.loveEmoji} role="img" aria-label="love">
                💙
              </span>{' '}
              by{' '}
              <Link
                href="https://idmcalculus.cv"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.creditLink}
              >
                idmcalculus
                <ExternalLink size={12} className={styles.externalIcon} />
              </Link>
            </span>
            <span className={styles.separator}>•</span>
            <Link
              href="https://buymeacoffee.com/idmcalculus"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.coffeeLink}
              aria-label="Buy me a coffee"
            >
              <span className={styles.coffeeEmoji}>☕</span>
              <span className={styles.coffeeText}>Buy me a coffee</span>
            </Link>
          </div>
        </div>

        {/* Subtle decorative line */}
        <div className={styles.decorativeLine} aria-hidden="true" />
      </div>
    </footer>
  );
}
