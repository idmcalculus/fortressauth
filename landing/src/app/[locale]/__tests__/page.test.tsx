import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/ThemeProvider';
import HomePage from '../page';

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
  Documentation: () => <section>Documentation</section>,
}));

describe('HomePage', () => {
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
  });
});
