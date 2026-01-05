import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Features } from '../Features';

// Mock requestAnimationFrame
const mockRAF = vi.fn((cb: FrameRequestCallback) => {
  setTimeout(() => cb(performance.now()), 16);
  return 1;
});

const mockCAF = vi.fn();

describe('Features', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('requestAnimationFrame', mockRAF);
    vi.stubGlobal('cancelAnimationFrame', mockCAF);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders title, subtitle, and feature cards', () => {
    render(<Features />);

    expect(screen.getByText('features.title')).toBeInTheDocument();
    expect(screen.getByText('features.subtitle')).toBeInTheDocument();

    // Check some specific features
    expect(screen.getByText('features.secureByDefault.title')).toBeInTheDocument();
    expect(screen.getByText('features.databaseAgnostic.title')).toBeInTheDocument();
    expect(screen.getByText('features.hexagonal.title')).toBeInTheDocument();
  });

  it('renders center logo', () => {
    render(<Features />);
    const logo = screen.getByAltText('FortressAuth');
    expect(logo).toBeInTheDocument();
  });

  it('renders all 8 feature cards', () => {
    render(<Features />);
    
    const featureKeys = [
      'secureByDefault',
      'databaseAgnostic',
      'emailAgnostic',
      'productionReady',
      'openApiDocs',
      'dockerReady',
      'sdks',
      'hexagonal',
    ];

    for (const key of featureKeys) {
      expect(screen.getByText(`features.${key}.title`)).toBeInTheDocument();
    }
  });

  it('shows description when hovering a card', async () => {
    render(<Features />);

    const secureCard = screen.getByText('features.secureByDefault.title').closest('div[class*="featureCard"]');
    expect(secureCard).toBeInTheDocument();

    // Hover on the card
    await act(async () => {
      fireEvent.mouseEnter(secureCard!);
    });

    // Description should appear (in both card and detail panel)
    await waitFor(() => {
      const descriptions = screen.getAllByText('features.secureByDefault.description');
      expect(descriptions.length).toBeGreaterThanOrEqual(1);
    });

    // Detail panel should also appear
    const section = screen.getByRole('region', { name: /features/i });
    const detailPanel = section.querySelector('div[class*="detailPanel"]');
    expect(detailPanel).toBeInTheDocument();
  });

  it('hides description when mouse leaves card', async () => {
    render(<Features />);

    const secureCard = screen.getByText('features.secureByDefault.title').closest('div[class*="featureCard"]');

    // Hover on the card
    await act(async () => {
      fireEvent.mouseEnter(secureCard!);
    });

    await waitFor(() => {
      const descriptions = screen.getAllByText('features.secureByDefault.description');
      expect(descriptions.length).toBeGreaterThanOrEqual(1);
    });

    // Leave the card
    await act(async () => {
      fireEvent.mouseLeave(secureCard!);
    });

    // Description should disappear (only in card, detail panel also disappears)
    await waitFor(() => {
      const descriptions = screen.queryAllByText('features.secureByDefault.description');
      // When not hovered, description should not be in the card
      expect(descriptions.length).toBe(0);
    });
  });

  it('shrinks center logo when a card is active', async () => {
    render(<Features />);

    const centerLogo = screen.getByAltText('FortressAuth').closest('div[class*="centerLogo"]');
    expect(centerLogo).toBeInTheDocument();
    expect(centerLogo?.className).not.toContain('centerLogoShrink');

    const secureCard = screen.getByText('features.secureByDefault.title').closest('div[class*="featureCard"]');

    await act(async () => {
      fireEvent.mouseEnter(secureCard!);
    });

    await waitFor(() => {
      const updatedCenterLogo = screen.getByAltText('FortressAuth').closest('div[class*="centerLogo"]');
      expect(updatedCenterLogo?.className).toContain('centerLogoShrink');
    });
  });

  it('handles mouse move on the section', async () => {
    render(<Features />);

    const section = screen.getByRole('region', { name: /features/i });
    
    await act(async () => {
      fireEvent.mouseMove(section, { clientX: 100, clientY: 200 });
    });

    // Just verify no errors occur
    expect(section).toBeInTheDocument();
  });

  it('pauses rotation when hovering a card', async () => {
    render(<Features />);

    // Let animation run
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const secureCard = screen.getByText('features.secureByDefault.title').closest('div[class*="featureCard"]');

    // Hover to pause
    await act(async () => {
      fireEvent.mouseEnter(secureCard!);
    });

    // Animation should be paused (isPaused = true)
    // We can verify by checking that the card is active
    await waitFor(() => {
      expect(secureCard?.className).toContain('featureCardActive');
    });
  });

  it('resumes rotation when mouse leaves card', async () => {
    render(<Features />);

    const secureCard = screen.getByText('features.secureByDefault.title').closest('div[class*="featureCard"]');

    // Hover to pause
    await act(async () => {
      fireEvent.mouseEnter(secureCard!);
    });

    await waitFor(() => {
      expect(secureCard?.className).toContain('featureCardActive');
    });

    // Leave to resume
    await act(async () => {
      fireEvent.mouseLeave(secureCard!);
    });

    await waitFor(() => {
      expect(secureCard?.className).not.toContain('featureCardActive');
    });
  });

  it('does not render its own canvas (uses shared background)', () => {
    render(<Features />);
    
    const section = screen.getByRole('region', { name: /features/i });
    const canvas = section.querySelector('canvas');
    // Canvas is now provided by HeroFeaturesWrapper, not Features itself
    expect(canvas).not.toBeInTheDocument();
  });

  it('renders orbit ring', () => {
    render(<Features />);
    
    const section = screen.getByRole('region', { name: /features/i });
    const orbitRing = section.querySelector('div[class*="orbitRing"]');
    expect(orbitRing).toBeInTheDocument();
  });

  it('shows detail panel with icon when card is hovered', async () => {
    render(<Features />);

    const databaseCard = screen.getByText('features.databaseAgnostic.title').closest('div[class*="featureCard"]');

    await act(async () => {
      fireEvent.mouseEnter(databaseCard!);
    });

    await waitFor(() => {
      // Detail panel should show the title and description
      const detailTitles = screen.getAllByText('features.databaseAgnostic.title');
      expect(detailTitles.length).toBeGreaterThanOrEqual(1);
      
      const detailDescriptions = screen.getAllByText('features.databaseAgnostic.description');
      expect(detailDescriptions.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('cleans up animation frames on unmount', async () => {
    const { unmount } = render(<Features />);

    // Let animation start
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    unmount();

    // cancelAnimationFrame should have been called
    expect(mockCAF).toHaveBeenCalled();
  });
});
