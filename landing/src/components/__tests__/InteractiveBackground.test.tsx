import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractiveBackground } from '../InteractiveBackground';

describe('InteractiveBackground', () => {
  let mockContext: {
    clearRect: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    arc: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    closePath: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    createRadialGradient: ReturnType<typeof vi.fn>;
    globalAlpha: number;
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
  };

  let rafCallback: ((time: number) => void) | null = null;

  const mockGradient = {
    addColorStop: vi.fn(),
  };

  beforeEach(() => {
    mockContext = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue(mockGradient),
      globalAlpha: 1,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    };

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);

    // Mock requestAnimationFrame to capture callback
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb;
      return 1;
    });

    // Mock cancelAnimationFrame
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    // Mock getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '#4ecdc4',
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rafCallback = null;
  });

  it('renders canvas element', () => {
    render(<InteractiveBackground />);
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('renders floating orbs', () => {
    render(<InteractiveBackground />);
    // Check for orb elements (they have aria-hidden)
    const orbs = document.querySelectorAll('[aria-hidden="true"]');
    expect(orbs.length).toBeGreaterThanOrEqual(3);
  });

  it('handles mouse move events', () => {
    render(<InteractiveBackground />);
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();

    if (canvas) {
      // Mock getBoundingClientRect
      canvas.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      });
      
      fireEvent.mouseMove(canvas, { clientX: 100, clientY: 100 });
      expect(canvas).toBeInTheDocument();
    }
  });

  it('handles mouse enter and leave events via document', () => {
    render(<InteractiveBackground />);
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();

    if (canvas) {
      // Mock getBoundingClientRect for the canvas
      canvas.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      });
      
      // Simulate mouse move within canvas bounds (triggers hovering)
      fireEvent.mouseMove(document, { clientX: 100, clientY: 100 });
      
      // Simulate mouse leaving the document
      fireEvent.mouseLeave(document);
      
      // Canvas should still be in document
      expect(canvas).toBeInTheDocument();
    }
  });

  it('handles window resize', () => {
    render(<InteractiveBackground />);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('cleans up on unmount', () => {
    const { unmount } = render(<InteractiveBackground />);
    
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    unmount();
    
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('canvas element has correct attributes', () => {
    render(<InteractiveBackground />);
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
  });

  it('runs animation frame', () => {
    render(<InteractiveBackground />);
    
    // Trigger animation frame
    if (rafCallback) {
      act(() => {
        rafCallback!(performance.now());
      });
    }
    
    // Verify canvas operations were called
    expect(mockContext.clearRect).toHaveBeenCalled();
  });

  it('draws particles on canvas', () => {
    render(<InteractiveBackground />);
    
    // Trigger animation frame
    if (rafCallback) {
      act(() => {
        rafCallback!(performance.now());
      });
    }
    
    // Verify drawing operations
    expect(mockContext.beginPath).toHaveBeenCalled();
  });

  it('handles particle types correctly', () => {
    render(<InteractiveBackground />);
    
    // Trigger multiple animation frames to cover different particle types
    if (rafCallback) {
      act(() => {
        rafCallback!(performance.now());
        rafCallback!(performance.now() + 16);
        rafCallback!(performance.now() + 32);
      });
    }
    
    // Verify various drawing operations for different particle types
    expect(mockContext.save).toHaveBeenCalled();
    expect(mockContext.restore).toHaveBeenCalled();
  });

  it('draws connections between particles', () => {
    render(<InteractiveBackground />);
    
    if (rafCallback) {
      act(() => {
        rafCallback!(performance.now());
      });
    }
    
    // Verify line drawing for connections
    expect(mockContext.moveTo).toHaveBeenCalled();
    expect(mockContext.lineTo).toHaveBeenCalled();
    expect(mockContext.stroke).toHaveBeenCalled();
  });

  it('responds to mouse proximity', () => {
    render(<InteractiveBackground />);
    const canvas = document.querySelector('canvas');
    
    if (canvas) {
      canvas.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      });
      
      // Move mouse to trigger proximity effects
      fireEvent.mouseMove(canvas, { clientX: 400, clientY: 300 });
      
      if (rafCallback) {
        act(() => {
          rafCallback!(performance.now());
        });
      }
      
      // Verify drawing operations occurred
      expect(mockContext.clearRect).toHaveBeenCalled();
    }
  });

  it('handles canvas without context gracefully', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
    
    // Should not throw
    expect(() => render(<InteractiveBackground />)).not.toThrow();
  });

  it('draws glowing particles', () => {
    render(<InteractiveBackground />);
    
    // Trigger multiple animation frames
    if (rafCallback) {
      for (let i = 0; i < 10; i++) {
        act(() => {
          rafCallback!(performance.now() + i * 16);
        });
      }
    }
    
    // Verify radial gradient was created for glow effect
    expect(mockContext.createRadialGradient).toHaveBeenCalled();
    // Verify arc was called for drawing particles
    expect(mockContext.arc).toHaveBeenCalled();
  });

  it('handles mouse at different positions', () => {
    render(<InteractiveBackground />);
    const canvas = document.querySelector('canvas');
    
    if (canvas) {
      canvas.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      });
      
      // Move mouse to different positions
      fireEvent.mouseMove(canvas, { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(canvas, { clientX: 800, clientY: 600 });
      fireEvent.mouseMove(canvas, { clientX: 400, clientY: 300 });
      
      if (rafCallback) {
        act(() => {
          rafCallback!(performance.now());
        });
      }
      
      expect(mockContext.clearRect).toHaveBeenCalled();
    }
  });

  it('handles negative mouse coordinates', () => {
    render(<InteractiveBackground />);
    const canvas = document.querySelector('canvas');
    
    if (canvas) {
      canvas.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 100,
        top: 100,
        width: 800,
        height: 600,
      });
      
      // Mouse outside canvas area
      fireEvent.mouseMove(canvas, { clientX: 50, clientY: 50 });
      
      if (rafCallback) {
        act(() => {
          rafCallback!(performance.now());
        });
      }
      
      expect(mockContext.clearRect).toHaveBeenCalled();
    }
  });
});

