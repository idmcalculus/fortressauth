'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X, Sun, Moon } from 'lucide-react';
import { SiGithub } from 'react-icons/si';
import { useTheme } from './ThemeProvider';
import Image from 'next/image';
import styles from './Navigation.module.css';

export function Navigation() {
  const t = useTranslations('nav');
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '#features', label: t('features') },
    { href: '#docs', label: t('docs') },
    { href: '#examples', label: t('examples') },
    { href: '#pricing', label: t('pricing') },
  ];

  return (
    <nav className={styles.nav}>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.logo}>
            <Image
              src="/logo.svg"
              alt="FortressAuth"
              width={40}
              height={40}
              className={styles.logoSvg}
            />
            <span className={styles.logoText}>FortressAuth</span>
          </div>

          {/* Desktop Navigation */}
          <div className={styles.desktopNav}>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className={styles.navLink}>
                {link.label}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              onClick={toggleTheme}
              className={styles.themeToggle}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? (
                <Moon style={{ width: '20px', height: '20px' }} />
              ) : (
                <Sun style={{ width: '20px', height: '20px' }} />
              )}
            </button>

            <a
              href="https://github.com/fortressauth"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.githubLink}
              aria-label="GitHub"
            >
              <SiGithub style={{ width: '20px', height: '20px' }} />
            </a>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={styles.mobileMenuButton}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X style={{ width: '24px', height: '24px' }} />
              ) : (
                <Menu style={{ width: '24px', height: '24px' }} />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className={styles.mobileMenu}>
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={styles.mobileNavLink}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}