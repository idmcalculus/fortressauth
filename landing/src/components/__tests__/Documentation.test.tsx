import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Documentation } from '../Documentation';

// Store original env
const originalEnv = { ...process.env };

// Type for mocked fetch - use ReturnType of vi.fn() to properly type the mock
type MockFetch = ReturnType<typeof vi.fn>;

describe('Documentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn() as typeof global.fetch;
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      AUTH_API_URL: 'http://localhost:5000',
      NEXT_PUBLIC_AUTH_API_URL: 'http://localhost:5000',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('shows searching state initially', async () => {
    (global.fetch as MockFetch).mockImplementation(() => new Promise(() => {})); // Hangs
    render(<Documentation externalDocsUrl="/api/proxy/docs/" />);
    expect(screen.getByText('Discovering API server...')).toBeInTheDocument();
  });

  it('renders iframe when server is found', async () => {
    (global.fetch as MockFetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    render(<Documentation externalDocsUrl="/api/proxy/docs/" />);

    await waitFor(() => {
      const iframe = screen.getByTitle('FortressAuth API Documentation');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', '/api/proxy/docs/');
    });
  });

  it('shows fallback when server returns non-ok status', async () => {
    (global.fetch as MockFetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'error' }),
    });

    render(<Documentation externalDocsUrl="/api/proxy/docs/" />);

    await waitFor(() => {
      expect(screen.getByText('documentation.serverNotRunning')).toBeInTheDocument();
    });
  });

  it('shows fallback when server is not found', async () => {
    const fetchMock = global.fetch as unknown as { mockRejectedValue: (value: unknown) => void };
    const fetchCalls = global.fetch as unknown as { mock: { calls: unknown[][] } };

    fetchMock.mockRejectedValue(new Error('Failed'));

    render(<Documentation externalDocsUrl="/api/proxy/docs/" />);

    await waitFor(() => {
      expect(screen.getByText('documentation.serverNotRunning')).toBeInTheDocument();
    });

    // Check retry button
    const retryButton = screen.getByText('Retry');
    await act(async () => {
      fireEvent.click(retryButton);
    });

    await waitFor(() => {
      expect(fetchCalls.mock.calls.length).toBe(2);
    });
  });

  it('retries discovery when Retry button is clicked', async () => {
    // All initial discovery attempts fail
    (global.fetch as MockFetch).mockRejectedValue(new Error('Failed'));

    render(<Documentation externalDocsUrl="/api/proxy/docs/" />);

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

    render(<Documentation externalDocsUrl="https://api.fortressauth.com/docs" />);

    await waitFor(() => {
      const link = screen.getByText(/documentation.openFullDocs/);
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', 'https://api.fortressauth.com/docs');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('uses the production docs URL when no explicit docs env is set', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      AUTH_API_URL: 'https://api.fortressauth.com',
      NEXT_PUBLIC_AUTH_API_URL: 'https://api.fortressauth.com',
    };

    render(<Documentation externalDocsUrl="https://api.fortressauth.com/docs" />);

    await waitFor(() => {
      const iframe = screen.getByTitle('FortressAuth API Documentation');
      expect(iframe).toHaveAttribute('src', '/api/proxy/docs/');
    });

    const link = screen.getByText(/documentation.openFullDocs/);
    expect(link.closest('a')).toHaveAttribute('href', 'https://api.fortressauth.com/docs');

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows command to start server in fallback', async () => {
    (global.fetch as MockFetch).mockRejectedValue(new Error('Failed'));

    render(<Documentation externalDocsUrl="/api/proxy/docs/" />);

    await waitFor(() => {
      expect(screen.getByText('pnpm --filter @fortressauth/server dev')).toBeInTheDocument();
    });
  });

  it('checks the configured AUTH_API_URL health endpoint', async () => {
    (global.fetch as MockFetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    render(<Documentation externalDocsUrl="/api/proxy/docs/" />);

    await waitFor(() => {
      expect(screen.getByTitle('FortressAuth API Documentation')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/proxy/health', {
      method: 'GET',
      signal: expect.any(AbortSignal),
    });
  });

  it('handles server returning ok:false response', async () => {
    (global.fetch as MockFetch).mockResolvedValue({
      ok: false,
    });

    render(<Documentation externalDocsUrl="/api/proxy/docs/" />);

    await waitFor(() => {
      expect(screen.getByText('documentation.serverNotRunning')).toBeInTheDocument();
    });
  });
});
