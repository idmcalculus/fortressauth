import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../ThemeProvider';

const TestComponent = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  );
};

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('provides default theme based on matchMedia preference', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    // matchMedia is mocked to return matches: false, so it falls back to 'light'
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('provides dark theme based on matchMedia preference', () => {
    // Mock matchMedia to return matches: true
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme').textContent).toBe('dark');

    // Restore
    window.matchMedia = originalMatchMedia;
  });

  it('toggles theme when toggleTheme is called', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    // Starts at light due to mock
    expect(screen.getByTestId('theme').textContent).toBe('light');

    const button = screen.getByText('Toggle');
    fireEvent.click(button);

    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    fireEvent.click(button);
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('loads theme from localStorage', () => {
    localStorage.setItem('theme', 'light');

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('throws error when used outside provider', () => {
    // Suppress console.error for this expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestComponent />)).toThrow('useTheme must be used within a ThemeProvider');

    spy.mockRestore();
  });
});
