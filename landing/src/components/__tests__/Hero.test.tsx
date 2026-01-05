import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hero } from '../Hero';

describe('Hero', () => {
  it('renders title and description', () => {
    render(<Hero />);

    expect(screen.getByText('hero.title')).toBeInTheDocument();
    expect(screen.getByText('hero.subtitle')).toBeInTheDocument();
    expect(screen.getByText('hero.description')).toBeInTheDocument();
  });

  it('renders action buttons with correct links', () => {
    render(<Hero />);

    const getStartedLink = screen.getByText('hero.getStarted');
    expect(getStartedLink.closest('a')).toHaveAttribute('href', '#docs');

    const viewDocsLink = screen.getByText('hero.viewDocs');
    expect(viewDocsLink.closest('a')).toHaveAttribute('href', '#examples');
  });

  it('renders stats with translated labels', () => {
    render(<Hero />);

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('hero.stats.typeSafe')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('hero.stats.coreDeps')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('hero.stats.databases')).toBeInTheDocument();
  });

  it('renders feature highlights', () => {
    render(<Hero />);

    expect(screen.getByText('hero.highlights.secureByDefault.title')).toBeInTheDocument();
    expect(screen.getByText('hero.highlights.databaseAgnostic.title')).toBeInTheDocument();
    expect(screen.getByText('hero.highlights.fastIntegration.title')).toBeInTheDocument();
    expect(screen.getByText('hero.highlights.productionReady.title')).toBeInTheDocument();
  });
});
