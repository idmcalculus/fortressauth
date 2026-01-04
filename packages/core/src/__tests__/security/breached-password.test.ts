import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBreachedPassword } from '../../security/breached-password.js';

describe('isBreachedPassword', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when check is disabled', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await isBreachedPassword('Password123!', {
      enabled: false,
      apiUrl: 'https://api.pwnedpasswords.com',
      timeoutMs: 1000,
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns false when fetch is unavailable', async () => {
    vi.stubGlobal('fetch', undefined as unknown as typeof fetch);

    const result = await isBreachedPassword('Password123!', {
      enabled: true,
      apiUrl: 'https://api.pwnedpasswords.com',
      timeoutMs: 1000,
    });

    expect(result).toBe(false);
  });

  it('returns true when password appears in breach list', async () => {
    const password = 'P@ssw0rd!';
    const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`ABCDEF:2\n${suffix}:42\n`),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await isBreachedPassword(password, {
      enabled: true,
      apiUrl: 'https://api.pwnedpasswords.com/',
      timeoutMs: 1000,
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      expect.objectContaining({
        headers: { 'Add-Padding': 'true' },
      }),
    );
  });

  it('returns false when the response is not ok', async () => {
    const textSpy = vi.fn().mockResolvedValue('ignored');
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: textSpy,
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await isBreachedPassword('Password123!', {
      enabled: true,
      apiUrl: 'https://api.pwnedpasswords.com',
      timeoutMs: 1000,
    });

    expect(result).toBe(false);
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('returns false when the breach list does not include the suffix', async () => {
    const password = 'NoMatchPass123!';
    const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('ABCDEF:2\n\n123456:1\n'),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await isBreachedPassword(password, {
      enabled: true,
      apiUrl: 'https://api.pwnedpasswords.com',
      timeoutMs: 1000,
    });

    expect(result).toBe(false);
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      expect.objectContaining({
        headers: { 'Add-Padding': 'true' },
      }),
    );
  });

  it('fails open when the API is unavailable', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('Network down'));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await isBreachedPassword('AnotherPass123!', {
      enabled: true,
      apiUrl: 'https://api.pwnedpasswords.com',
      timeoutMs: 1000,
    });

    expect(result).toBe(false);
  });

  it('fails open when the request times out via AbortController', async () => {
    // Mock a slow fetch that will be aborted by the timeout
    const fetchSpy = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        // Listen for abort signal
        if (options?.signal) {
          const signal = options.signal as AbortSignal;
          signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }
        // Never resolve - simulates a slow request that will be aborted
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await isBreachedPassword('TimeoutTest123!', {
      enabled: true,
      apiUrl: 'https://api.pwnedpasswords.com',
      timeoutMs: 50, // Short timeout to trigger abort quickly
    });

    // Should fail open (return false) when timeout occurs
    expect(result).toBe(false);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
