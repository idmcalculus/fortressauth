import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from '../page';

describe('Root Home Page', () => {
  it('renders Next.js starter content', () => {
    render(<Home />);

    expect(screen.getByAltText('Next.js logo')).toBeInTheDocument();
    expect(screen.getByText(/Get started by editing/)).toBeInTheDocument();
  });
});
