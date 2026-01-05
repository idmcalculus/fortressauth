import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'pt', 'ru', 'ar', 'hi', 'yo'],
  defaultLocale: 'en',
});

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
