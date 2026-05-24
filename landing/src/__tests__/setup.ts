import '@testing-library/jest-dom';
import { vi } from 'vitest';

// -----------------------------------------------------------------------------
// Node 25 ships an experimental built-in `localStorage` global. When the
// runtime is started without a `--localstorage-file` flag (which is our case
// under vitest), Node installs an empty placeholder object that shadows
// jsdom's Storage on `globalThis`/`window` in the jsdom test environment. The
// placeholder has no `getItem`/`setItem`/`clear`, so any test or component
// code that uses bare `localStorage.foo()` crashes with
// `TypeError: localStorage.clear is not a function`.
//
// We install a minimal in-memory Storage implementation that conforms to the
// Web Storage API and reassign it on both `window` and `globalThis` (which
// are the same object in jsdom but are separately enumerated). This is the
// closest behavior to a real browser for component tests; persistence beyond
// a test run is irrelevant since each vitest worker gets a fresh module
// graph.
// -----------------------------------------------------------------------------
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => (store.has(key) ? (store.get(key) ?? null) : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
  };
  return storage;
}

{
  const localStorageImpl = createMemoryStorage();
  const sessionStorageImpl = createMemoryStorage();

  // jsdom env makes `globalThis === window`. We install on both names so any
  // code path that reads `globalThis.localStorage`, `window.localStorage`, or
  // bare `localStorage` resolves to the same instance.
  for (const target of [globalThis, typeof window !== 'undefined' ? window : null].filter(
    Boolean,
  ) as object[]) {
    Object.defineProperty(target, 'localStorage', {
      configurable: true,
      writable: true,
      value: localStorageImpl,
    });
    Object.defineProperty(target, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: sessionStorageImpl,
    });
  }
}

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
