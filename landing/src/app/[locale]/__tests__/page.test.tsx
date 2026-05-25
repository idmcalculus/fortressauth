import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/ThemeProvider';
import HomePage from '../page';

const documentationProps = vi.hoisted(() => [] as string[]);

// Mock all components used in page.tsx
vi.mock('@/components/Navigation', () => ({ Navigation: () => <nav>Navigation</nav> }));
vi.mock('@/components/Hero', () => ({ Hero: () => <section>Hero</section> }));
vi.mock('@/components/Features', () => ({ Features: () => <section>Features</section> }));
vi.mock('@/components/CodeShowcase', () => ({
  CodeShowcase: () => <section>CodeShowcase</section>,
}));
vi.mock('@/components/ExamplesShowcase', () => ({
  ExamplesShowcase: () => <section>ExamplesShowcase</section>,
}));
vi.mock('@/components/Documentation', () => ({
  Documentation: ({ externalDocsUrl }: { externalDocsUrl: string }) => {
    documentationProps.push(externalDocsUrl);
    return <section>Documentation</section>;
  },
}));

describe('HomePage', () => {
  afterEach(() => {
    documentationProps.length = 0;
    vi.unstubAllEnvs();
  });

  it('renders all sections', () => {
    render(
      <ThemeProvider>
        <HomePage />
      </ThemeProvider>,
    );

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Hero')).toBeInTheDocument();
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('CodeShowcase')).toBeInTheDocument();
    expect(screen.getByText('ExamplesShowcase')).toBeInTheDocument();
    expect(screen.getByText('Documentation')).toBeInTheDocument();
    expect(documentationProps.at(-1)).toBe('/api/proxy/docs/');
  });

  it('uses the configured docs URL in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_DOCS_URL', 'https://docs.example.com/reference/');

    render(
      <ThemeProvider>
        <HomePage />
      </ThemeProvider>,
    );

    expect(documentationProps.at(-1)).toBe('https://docs.example.com/reference');
  });

  it('falls back to proxied docs in production when docs URL is unavailable', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_API_URL', '');
    vi.stubEnv('NEXT_PUBLIC_AUTH_API_URL', '');
    vi.stubEnv('NEXT_PUBLIC_DOCS_URL', '');

    render(
      <ThemeProvider>
        <HomePage />
      </ThemeProvider>,
    );

    expect(documentationProps.at(-1)).toBe('/api/proxy/docs/');
  });
});
