'use client';

import { Languages } from 'lucide-react';
import { useLocale } from 'next-intl';
import { routing, usePathname, useRouter } from '@/i18n/routing';
import styles from './LocaleSwitcher.module.css';

const localeNames: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  zh: '中文',
  ja: '日本語',
  pt: 'Português',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  yo: 'Yorùbá',
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function onSelectChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value;
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div className={styles.wrapper}>
      <Languages className={styles.icon} />
      <select
        defaultValue={locale}
        onChange={onSelectChange}
        className={styles.select}
        aria-label="Select language"
      >
        {routing.locales.map((cur: string) => (
          <option key={cur} value={cur}>
            {localeNames[cur] || cur}
          </option>
        ))}
      </select>
    </div>
  );
}
