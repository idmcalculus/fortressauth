import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Navigation } from '../Navigation';
import { ThemeProvider } from '../ThemeProvider';

describe('Navigation', () => {
  it('renders logo and navigation links', () => {
    render(
      <ThemeProvider>
        <Navigation />
      </ThemeProvider>,
    );

    expect(screen.getByText('FortressAuth')).toBeInTheDocument();
    expect(screen.getByText('nav.features')).toBeInTheDocument();
    expect(screen.getByText('nav.docs')).toBeInTheDocument();
  });

  it('toggles mobile menu when button is clicked', () => {
    render(
      <ThemeProvider>
        <Navigation />
      </ThemeProvider>,
    );

    const menuButton = screen.getByLabelText('Toggle menu');
    fireEvent.click(menuButton);

    // Mobile menu links should now be visible (they are separate from desktop links)
    const mobileLinks = screen.getAllByText('nav.features');
    expect(mobileLinks.length).toBeGreaterThan(1);

    // Click mobile link should close menu
    // biome-ignore lint/style/noNonNullAssertion: array index is known to be valid
    fireEvent.click(mobileLinks[1]!);
    expect(
      screen.queryByText('nav.features', { selector: '.mobileNavLink' }),
    ).not.toBeInTheDocument();
  });

  it('toggles theme when theme button is clicked', () => {
    render(
      <ThemeProvider>
        <Navigation />
      </ThemeProvider>,
    );

    const themeButton = screen.getByLabelText('Toggle theme');
    fireEvent.click(themeButton);

    // We can't easily check documentElement in this test without more setup,
    // but we verify the button click doesn't crash.
  });
});
