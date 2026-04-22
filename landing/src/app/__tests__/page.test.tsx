import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from '../page';

describe('Root Home Page', () => {
  it('renders a branded fallback for the locale middleware root', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: 'FortressAuth' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open FortressAuth' })).toHaveAttribute('href', '/en');
  });
});
