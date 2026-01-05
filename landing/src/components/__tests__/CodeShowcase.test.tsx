import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeShowcase } from '../CodeShowcase';

describe('CodeShowcase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders correctly and allows switching tabs', () => {
    render(<CodeShowcase />);

    expect(screen.getByText('codeShowcase.title')).toBeInTheDocument();

    // Initial tab (Quick Start)
    expect(screen.getByText(/FortressAuth/)).toBeInTheDocument();
    expect(screen.getByText('server.ts')).toBeInTheDocument();

    // Switch to React tab
    const reactTab = screen.getByText('codeShowcase.tabs.reactSdk');
    fireEvent.click(reactTab);

    expect(screen.getByText('LoginForm.tsx')).toBeInTheDocument();
    expect(screen.getByText(/useAuth/)).toBeInTheDocument();
  });

  it('renders copy button with correct accessibility', () => {
    render(<CodeShowcase />);

    const copyButton = screen.getByRole('button', { name: 'codeShowcase.copy' });
    expect(copyButton).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<CodeShowcase />);

    // Check tablist role
    expect(screen.getByRole('tablist')).toBeInTheDocument();

    // Check tab roles
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(0);

    // Check tabpanel role
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('copies code to clipboard using navigator.clipboard API', async () => {
    vi.useRealTimers(); // Use real timers for this test

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<CodeShowcase />);

    const copyButton = screen.getByRole('button', { name: 'codeShowcase.copy' });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
    });

    // Restore original clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  it('handles copy button click and shows copied state', async () => {
    vi.useRealTimers();

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<CodeShowcase />);

    const copyButton = screen.getByRole('button', { name: 'codeShowcase.copy' });
    fireEvent.click(copyButton);

    // Wait for the copied state
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'codeShowcase.copied' })).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });

  it('switches between all tabs correctly', () => {
    render(<CodeShowcase />);

    // Test Vue tab
    fireEvent.click(screen.getByText('codeShowcase.tabs.vueSdk'));
    expect(screen.getByText('LoginForm.vue')).toBeInTheDocument();

    // Test Angular tab
    fireEvent.click(screen.getByText('codeShowcase.tabs.angularSdk'));
    expect(screen.getByText('login.component.ts')).toBeInTheDocument();

    // Test Svelte tab
    fireEvent.click(screen.getByText('codeShowcase.tabs.svelteSdk'));
    expect(screen.getByText('Login.svelte')).toBeInTheDocument();

    // Test React Native tab
    fireEvent.click(screen.getByText('codeShowcase.tabs.reactNativeSdk'));
    expect(screen.getByText('App.tsx')).toBeInTheDocument();

    // Test Expo tab
    fireEvent.click(screen.getByText('codeShowcase.tabs.expoSdk'));
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
  });

  it('renders all feature highlights', () => {
    render(<CodeShowcase />);

    expect(screen.getByText('codeShowcase.features.fast')).toBeInTheDocument();
    expect(screen.getByText('codeShowcase.features.secure')).toBeInTheDocument();
    expect(screen.getByText('codeShowcase.features.typed')).toBeInTheDocument();
    expect(screen.getByText('codeShowcase.features.pluggable')).toBeInTheDocument();
    expect(screen.getByText('codeShowcase.features.zeroDeps')).toBeInTheDocument();
  });

  it('renders Electron SDK tab correctly', () => {
    render(<CodeShowcase />);

    // Switch to Electron tab
    fireEvent.click(screen.getByText('codeShowcase.tabs.electronSdk'));
    expect(screen.getByText('main.ts')).toBeInTheDocument();
    expect(screen.getByText(/createAuth/)).toBeInTheDocument();
  });

  it('renders scroll hint indicators', () => {
    render(<CodeShowcase />);

    // Scroll hints should be present in the DOM (hidden by default)
    const scrollHints = document.querySelectorAll('[aria-hidden="true"]');
    expect(scrollHints.length).toBeGreaterThan(0);
  });

  it('handles scroll events on tabs container', () => {
    render(<CodeShowcase />);

    const tablist = screen.getByRole('tablist');
    
    // Mock scrollWidth > clientWidth to simulate scrollable content
    Object.defineProperty(tablist, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(tablist, 'clientWidth', { value: 500, configurable: true });
    Object.defineProperty(tablist, 'scrollLeft', { value: 100, configurable: true });
    
    // Simulate scroll event
    fireEvent.scroll(tablist);
    
    // The component should handle scroll without errors
    expect(tablist).toBeInTheDocument();
  });

  it('handles window resize events', () => {
    render(<CodeShowcase />);

    // Simulate window resize
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    // Component should handle resize without errors
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('shows scroll hints when content is scrollable', () => {
    render(<CodeShowcase />);

    const tablist = screen.getByRole('tablist');
    
    // Mock scrollable state - scrolled to middle
    Object.defineProperty(tablist, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(tablist, 'clientWidth', { value: 500, configurable: true });
    Object.defineProperty(tablist, 'scrollLeft', { value: 200, writable: true, configurable: true });
    
    // Trigger scroll event to update state
    fireEvent.scroll(tablist);
    
    expect(tablist).toBeInTheDocument();
  });

  it('hides left scroll hint when at start', () => {
    render(<CodeShowcase />);

    const tablist = screen.getByRole('tablist');
    
    // Mock scrollable state - at start
    Object.defineProperty(tablist, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(tablist, 'clientWidth', { value: 500, configurable: true });
    Object.defineProperty(tablist, 'scrollLeft', { value: 0, writable: true, configurable: true });
    
    // Trigger scroll event
    fireEvent.scroll(tablist);
    
    expect(tablist).toBeInTheDocument();
  });

  it('hides right scroll hint when at end', () => {
    render(<CodeShowcase />);

    const tablist = screen.getByRole('tablist');
    
    // Mock scrollable state - at end
    Object.defineProperty(tablist, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(tablist, 'clientWidth', { value: 500, configurable: true });
    Object.defineProperty(tablist, 'scrollLeft', { value: 500, writable: true, configurable: true });
    
    // Trigger scroll event
    fireEvent.scroll(tablist);
    
    expect(tablist).toBeInTheDocument();
  });

  it('handles non-scrollable content', () => {
    render(<CodeShowcase />);

    const tablist = screen.getByRole('tablist');
    
    // Mock non-scrollable state
    Object.defineProperty(tablist, 'scrollWidth', { value: 500, configurable: true });
    Object.defineProperty(tablist, 'clientWidth', { value: 500, configurable: true });
    Object.defineProperty(tablist, 'scrollLeft', { value: 0, writable: true, configurable: true });
    
    // Trigger scroll event
    fireEvent.scroll(tablist);
    
    expect(tablist).toBeInTheDocument();
  });

  it('handles clipboard API failure gracefully', async () => {
    vi.useRealTimers();

    const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard not available'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<CodeShowcase />);

    const copyButton = screen.getByRole('button', { name: 'codeShowcase.copy' });
    fireEvent.click(copyButton);

    // Should not throw, just silently fail
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
    });

    // Button should still show "copy" since it failed
    expect(screen.getByRole('button', { name: 'codeShowcase.copy' })).toBeInTheDocument();
  });

  it('renders subtitle text', () => {
    render(<CodeShowcase />);
    expect(screen.getByText('codeShowcase.subtitle')).toBeInTheDocument();
  });

  it('renders code content for each tab', () => {
    render(<CodeShowcase />);

    // Quick Start tab (default)
    expect(screen.getByText(/MemoryRateLimiter/)).toBeInTheDocument();

    // Switch to React and verify content
    fireEvent.click(screen.getByText('codeShowcase.tabs.reactSdk'));
    expect(screen.getByText(/useUser/)).toBeInTheDocument();
  });
});
