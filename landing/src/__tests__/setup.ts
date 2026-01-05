import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    return (key: string) => `${namespace}.${key}`;
  },
  useLocale: () => 'en',
}));

// Mock next-intl navigation helpers
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    Link: ({ children }: { children: unknown }) => children,
    redirect: vi.fn(),
    usePathname: () => '/',
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
    }),
  }),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
