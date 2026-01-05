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

  it('renders stats', () => {
    render(<Hero />);

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('Type Safe')).toBeInTheDocument();
  });
});
