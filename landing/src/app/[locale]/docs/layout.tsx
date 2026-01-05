'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useState, useCallback, useMemo } from 'react';
import { Search, Menu, X, ChevronRight, Book, Rocket, Code } from 'lucide-react';
import styles from './docs.module.css';

interface NavItem {
  title: string;
  href: string;
  icon?: React.ReactNode;
  children?: NavItem[];
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('docs');
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<string[]>(['getting-started', 'api-reference']);

  const navItems: NavItem[] = useMemo(() => [
    {
      title: t('nav.gettingStarted'),
      href: '/docs',
      icon: <Rocket size={18} />,
      children: [
        { title: t('nav.introduction'), href: '/docs' },
        { title: t('nav.installation'), href: '/docs/installation' },
        { title: t('nav.quickStart'), href: '/docs/quick-start' },
      ],
    },
    {
      title: t('nav.apiReference'),
      href: '/docs/api',
      icon: <Code size={18} />,
      children: [
        { title: t('nav.fortressAuth'), href: '/docs/api/fortress-auth' },
        { title: t('nav.configuration'), href: '/docs/api/configuration' },
        { title: t('nav.errorCodes'), href: '/docs/api/error-codes' },
      ],
    },
    // TODO: Uncomment when security docs are implemented
    // {
    //   title: t('nav.security'),
    //   href: '/docs/security',
    //   icon: <Shield size={18} />,
    //   children: [
    //     { title: t('nav.passwordHashing'), href: '/docs/security/password-hashing' },
    //     { title: t('nav.sessionManagement'), href: '/docs/security/sessions' },
    //     { title: t('nav.rateLimiting'), href: '/docs/security/rate-limiting' },
    //   ],
    // },
    // TODO: Uncomment when adapter docs are implemented
    // {
    //   title: t('nav.adapters'),
    //   href: '/docs/adapters',
    //   icon: <Database size={18} />,
    //   children: [
    //     { title: t('nav.sqlAdapter'), href: '/docs/adapters/sql' },
    //     { title: t('nav.customAdapters'), href: '/docs/adapters/custom' },
    //   ],
    // },
    // TODO: Uncomment when email provider docs are implemented
    // {
    //   title: t('nav.emailProviders'),
    //   href: '/docs/email',
    //   icon: <Mail size={18} />,
    //   children: [
    //     { title: t('nav.consoleProvider'), href: '/docs/email/console' },
    //     { title: t('nav.resendProvider'), href: '/docs/email/resend' },
    //     { title: t('nav.sesProvider'), href: '/docs/email/ses' },
    //     { title: t('nav.sendgridProvider'), href: '/docs/email/sendgrid' },
    //     { title: t('nav.smtpProvider'), href: '/docs/email/smtp' },
    //   ],
    // },
    // TODO: Uncomment when SDK docs are implemented
    // {
    //   title: t('nav.sdks'),
    //   href: '/docs/sdks',
    //   icon: <Layers size={18} />,
    //   children: [
    //     { title: t('nav.reactSdk'), href: '/docs/sdks/react' },
    //     { title: t('nav.vueSdk'), href: '/docs/sdks/vue' },
    //     { title: t('nav.angularSdk'), href: '/docs/sdks/angular' },
    //     { title: t('nav.svelteSdk'), href: '/docs/sdks/svelte' },
    //   ],
    // },
    // TODO: Uncomment when deployment docs are implemented
    // {
    //   title: t('nav.deployment'),
    //   href: '/docs/deployment',
    //   icon: <Server size={18} />,
    //   children: [
    //     { title: t('nav.docker'), href: '/docs/deployment/docker' },
    //     { title: t('nav.railway'), href: '/docs/deployment/railway' },
    //   ],
    // },
  ], [t]);

  const toggleSection = useCallback((sectionHref: string) => {
    setExpandedSections(prev => 
      prev.includes(sectionHref) 
        ? prev.filter(s => s !== sectionHref)
        : [...prev, sectionHref]
    );
  }, []);

  const isActive = useCallback((href: string) => {
    // Remove locale prefix for comparison
    const cleanPathname = pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?/, '');
    return cleanPathname === href || cleanPathname === href + '/';
  }, [pathname]);

  const filteredNavItems = useMemo(() => {
    if (!searchQuery.trim()) return navItems;
    
    const query = searchQuery.toLowerCase();
    return navItems.map(section => ({
      ...section,
      children: section.children?.filter(item => 
        item.title.toLowerCase().includes(query)
      ),
    })).filter(section => 
      section.title.toLowerCase().includes(query) || 
      (section.children && section.children.length > 0)
    );
  }, [navItems, searchQuery]);

  return (
    <div className={styles.docsLayout}>
      {/* Mobile menu button */}
      <button
        className={styles.mobileMenuButton}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <Book size={24} className={styles.sidebarIcon} />
          <span className={styles.sidebarTitle}>{t('title')}</span>
        </div>

        {/* Search */}
        <div className={styles.searchContainer}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
            aria-label={t('searchPlaceholder')}
          />
        </div>

        {/* Navigation */}
        <nav className={styles.nav} aria-label="Documentation navigation">
          {filteredNavItems.map((section) => (
            <div key={section.href} className={styles.navSection}>
              <button
                className={styles.navSectionHeader}
                onClick={() => toggleSection(section.href)}
                aria-expanded={expandedSections.includes(section.href)}
              >
                {section.icon}
                <span>{section.title}</span>
                <ChevronRight 
                  size={16} 
                  className={`${styles.chevron} ${expandedSections.includes(section.href) ? styles.chevronExpanded : ''}`}
                />
              </button>
              {expandedSections.includes(section.href) && section.children && (
                <ul className={styles.navList}>
                  {section.children.map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className={`${styles.navLink} ${isActive(item.href) ? styles.navLinkActive : ''}`}
                        onClick={() => setSidebarOpen(false)}
                      >
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className={styles.overlay} 
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main content */}
      <main className={styles.main}>
        <div className={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}
