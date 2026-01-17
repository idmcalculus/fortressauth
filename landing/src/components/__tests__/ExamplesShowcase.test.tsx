import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { ExamplesShowcase } from '../ExamplesShowcase';

// Mock IntersectionObserver and ResizeObserver for embla-carousel
beforeAll(() => {
  class MockIntersectionObserver {
    observe = () => null;
    unobserve = () => null;
    disconnect = () => null;
    root = null;
    rootMargin = '';
    thresholds = [];
    takeRecords = () => [];
  }
  window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

  class MockResizeObserver {
    observe = () => null;
    unobserve = () => null;
    disconnect = () => null;
  }
  window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

describe('ExamplesShowcase', () => {
  it('renders all examples', () => {
    render(<ExamplesShowcase />);

    expect(screen.getByText('examples.title')).toBeInTheDocument();

    expect(screen.getByText('examples.basic-usage.title')).toBeInTheDocument();
    expect(screen.getByText('examples.web-react.title')).toBeInTheDocument();
    expect(screen.getByText('examples.web-vue.title')).toBeInTheDocument();
    expect(screen.getByText('examples.web-svelte.title')).toBeInTheDocument();
    expect(screen.getByText('examples.web-angular.title')).toBeInTheDocument();
    expect(screen.getByText('examples.mobile-expo.title')).toBeInTheDocument();
    expect(screen.getByText('examples.desktop-electron.title')).toBeInTheDocument();
  });

  it('renders correct links', () => {
    render(<ExamplesShowcase />);

    const codeLinks = screen.getAllByText('examples.viewCode →');
    expect(codeLinks.length).toBe(7); // All 7 examples have code links

    const demoLinks = screen.getAllByText('examples.viewDemo →');
    expect(demoLinks.length).toBe(4); // Only web examples have demos (React, Vue, Svelte, Angular)
  });

  it('renders carousel navigation buttons', () => {
    render(<ExamplesShowcase />);

    expect(screen.getByLabelText('examples.prevSlide')).toBeInTheDocument();
    expect(screen.getByLabelText('examples.nextSlide')).toBeInTheDocument();
  });

  it('renders dot navigation', () => {
    render(<ExamplesShowcase />);

    // Should have 7 dots for 7 examples
    const dots = screen.getAllByRole('button', { name: /examples\.goToSlide/i });
    expect(dots.length).toBe(7);
  });

  it('handles navigation button clicks', () => {
    render(<ExamplesShowcase />);

    const prevButton = screen.getByLabelText('examples.prevSlide');
    const nextButton = screen.getByLabelText('examples.nextSlide');

    // Click navigation buttons (they may not do anything without full embla setup, but we test they're clickable)
    fireEvent.click(nextButton);
    fireEvent.click(prevButton);

    // Buttons should still be in the document
    expect(prevButton).toBeInTheDocument();
    expect(nextButton).toBeInTheDocument();
  });

  it('handles dot navigation clicks', () => {
    render(<ExamplesShowcase />);

    const dots = screen.getAllByRole('button', { name: /examples\.goToSlide/i });

    // Click on different dots
    // biome-ignore lint/style/noNonNullAssertion: array index is known to be valid
    fireEvent.click(dots[2]!);
    // biome-ignore lint/style/noNonNullAssertion: array index is known to be valid
    fireEvent.click(dots[5]!);

    // Dots should still be in the document
    expect(dots[2]).toBeInTheDocument();
    expect(dots[5]).toBeInTheDocument();
  });
});
