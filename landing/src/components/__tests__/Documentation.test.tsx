import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Documentation } from '../Documentation';

// Store original env
const originalEnv = process.env;

// Type for mocked fetch - use ReturnType of vi.fn() to properly type the mock
type MockFetch = ReturnType<typeof vi.fn>;

describe('Documentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn() as typeof global.fetch;
    // Reset env
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('shows searching state initially', async () => {
    (global.fetch as MockFetch).mockImplementation(() => new Promise(() => {})); // Hangs
    render(<Documentation />);
    expect(screen.getByText('Discovering API server...')).toBeInTheDocument();
  });

  it('renders iframe when server is found', async () => {
    (global.fetch as MockFetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    render(<Documentation />);

    await waitFor(() => {
      expect(screen.getByTitle('FortressAuth API Documentation')).toBeInTheDocument();
    });
  });

  it('shows fallback when server returns non-ok status', async () => {
    (global.fetch as MockFetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'error' }),
    });

    render(<Documentation />);

    await waitFor(() => {
      expect(screen.getByText('documentation.serverNotRunning')).toBeInTheDocument();
    });
  });

  it('shows fallback when server is not found', async () => {
    const fetchMock = global.fetch as unknown as { mockRejectedValue: (value: unknown) => void };
    const fetchCalls = global.fetch as unknown as { mock: { calls: unknown[][] } };

    fetchMock.mockRejectedValue(new Error('Failed'));

    render(<Documentation />);

    await waitFor(() => {
      expect(screen.getByText('documentation.serverNotRunning')).toBeInTheDocument();
    });

    // Check retry button
    const retryButton = screen.getByText('Retry');
    await act(async () => {
      fireEvent.click(retryButton);
    });

    // 11 ports tried twice (initial + retry) = 22 calls
    await waitFor(() => {
      expect(fetchCalls.mock.calls.length).toBe(22);
    });
  });

  it('retries discovery when Retry button is clicked', async () => {
    // All initial discovery attempts fail
    (global.fetch as MockFetch).mockRejectedValue(new Error('Failed'));

    render(<Documentation />);

    await waitFor(
      () => {
        expect(screen.getByText('documentation.serverNotRunning')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Mock success for the retry
    (global.fetch as MockFetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const retryButton = screen.getByText('Retry');
    await act(async () => {
      fireEvent.click(retryButton);
    });

    await waitFor(() => {
      expect(screen.getByTitle('FortressAuth API Documentation')).toBeInTheDocument();
    });
  });

  it('renders external link to docs', async () => {
    (global.fetch as MockFetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    render(<Documentation />);

    await waitFor(() => {
      const link = screen.getByText(/documentation.openFullDocs/);
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('shows command to start server in fallback', async () => {
    (global.fetch as MockFetch).mockRejectedValue(new Error('Failed'));

    render(<Documentation />);

    await waitFor(() => {
      expect(screen.getByText('pnpm --filter @fortressauth/server dev')).toBeInTheDocument();
    });
  });

  it('tries multiple ports when discovering server', async () => {
    // First 3 ports fail, 4th succeeds
    (global.fetch as MockFetch)
      .mockRejectedValueOnce(new Error('Failed'))
      .mockRejectedValueOnce(new Error('Failed'))
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

    render(<Documentation />);

    await waitFor(() => {
      expect(screen.getByTitle('FortressAuth API Documentation')).toBeInTheDocument();
    });
  });

  it('handles server returning ok:false response', async () => {
    (global.fetch as MockFetch).mockResolvedValue({
      ok: false,
    });

    render(<Documentation />);

    await waitFor(() => {
      expect(screen.getByText('documentation.serverNotRunning')).toBeInTheDocument();
    });
  });
});
