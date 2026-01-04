import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExamplesShowcase } from '../ExamplesShowcase';

describe('ExamplesShowcase', () => {
  it('renders all examples', () => {
    render(<ExamplesShowcase />);

    expect(screen.getByText('examples.title')).toBeInTheDocument();

    expect(screen.getByText('examples.basic-usage.title')).toBeInTheDocument();
    expect(screen.getByText('examples.web-react.title')).toBeInTheDocument();
    expect(screen.getByText('examples.web-vue.title')).toBeInTheDocument();
    expect(screen.getByText('examples.web-svelte.title')).toBeInTheDocument();
    expect(screen.getByText('examples.web-angular.title')).toBeInTheDocument();
  });

  it('renders correct links', () => {
    render(<ExamplesShowcase />);

    const codeLinks = screen.getAllByText('examples.viewCode →');
    expect(codeLinks.length).toBe(5);

    const demoLinks = screen.getAllByText('examples.viewDemo →');
    expect(demoLinks.length).toBe(4); // Node.js example has no demo
  });
});
