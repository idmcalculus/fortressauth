import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Documentation } from '../Documentation';

describe('Documentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('shows searching state initially', async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {})); // Hangs
    render(<Documentation />);
    expect(screen.getByText('Discovering API server...')).toBeInTheDocument();
  });

  it('renders iframe when server is found', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    render(<Documentation />);

    await waitFor(() => {
      expect(screen.getByTitle('FortressAuth API Documentation')).toBeInTheDocument();
    });
  });

  it('shows fallback when server returns non-ok status', async () => {
    (global.fetch as any).mockResolvedValueOnce({
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

    await waitFor(() => {
      expect(fetchCalls.mock.calls.length).toBe(8);
    });
  });

  it('retries discovery when Retry button is clicked', async () => {
    // All initial discovery attempts fail
    (global.fetch as any).mockRejectedValue(new Error('Failed'));

    render(<Documentation />);

    await waitFor(
      () => {
        expect(screen.getByText('documentation.serverNotRunning')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Mock success for the retry
    (global.fetch as any).mockResolvedValueOnce({
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
});
