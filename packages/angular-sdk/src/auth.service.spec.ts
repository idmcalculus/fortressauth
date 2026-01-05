import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const jsonResponse = (data: unknown, contentType = 'application/json') => ({
  headers: { get: () => contentType },
  json: () => Promise.resolve(data),
});

type MockResponse = ReturnType<typeof jsonResponse>;

const createDeferred = <T>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
};

const clearCsrfCookie = () => {
  const doc = (globalThis as { document?: { cookie?: string } }).document;
  if (doc) {
    doc.cookie = 'fortress_csrf=; Max-Age=0';
  }
};

const getHeaderValue = (headers: unknown, name: string) =>
  new Headers(headers as Record<string, string>).get(name);

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    const doc = (globalThis as { document?: { cookie?: string } }).document;
    if (doc) {
      doc.cookie = 'fortress_csrf=test-csrf';
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create service with default baseUrl', () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
      expect(service).toBeDefined();
    });

    it('should create service with custom baseUrl from config', () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService({ baseUrl: 'https://custom.api.com' });
      expect(service).toBeDefined();
    });

    it('should use window.__FORTRESS_API_URL__ if present', () => {
      vi.stubGlobal('window', { __FORTRESS_API_URL__: 'https://env.api.com' });
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });

      service = new AuthService();
      // Wait for async initialization
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(mockFetch).toHaveBeenCalledWith('https://env.api.com/auth/me', expect.any(Object));
          vi.unstubAllGlobals();
          resolve();
        }, 10);
      });
    });

    it('should call refreshUser on initialization', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              user: {
                id: '1',
                email: 'test@example.com',
                emailVerified: true,
                createdAt: '2024-01-01',
              },
            },
          }),
      });
      service = new AuthService();
      // Wait for async initialization
      await new Promise((r) => setTimeout(r, 10));
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/me',
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });

  describe('signUp', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should sign up successfully', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: '2024-01-01',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });

      const result = await service.signUp('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.data?.user).toEqual(mockUser);
      expect(service.currentUser).toEqual(mockUser);
    });

    it('should handle signup failure', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Email already exists' }),
      });

      const result = await service.signUp('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already exists');
      expect(service.currentError).toBe('Email already exists');
    });

    it('should handle signup failure with default error message', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false }),
      });

      const result = await service.signUp('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(service.currentError).toBe('UNKNOWN_ERROR');
    });
  });

  describe('signIn', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should sign in successfully', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: true,
        createdAt: '2024-01-01',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(service.currentUser).toEqual(mockUser);
    });

    it('should handle signin failure', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Invalid credentials' }),
      });

      const result = await service.signIn('test@example.com', 'wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should handle signin failure with default error message', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false }),
      });

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(service.currentError).toBe('UNKNOWN_ERROR');
    });
  });

  describe('csrf handling', () => {
    it('fetches a csrf token once for concurrent requests', async () => {
      clearCsrfCookie();
      const deferred = createDeferred<MockResponse>();
      const loginHeaders: string[] = [];
      let csrfCalls = 0;

      mockFetch.mockImplementation((input, init) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) {
          return Promise.resolve(jsonResponse({ success: false, error: 'No session' }));
        }
        if (url.endsWith('/auth/csrf')) {
          csrfCalls += 1;
          return deferred.promise;
        }
        if (url.endsWith('/auth/login')) {
          const headerValue = getHeaderValue(init?.headers, 'x-csrf-token');
          loginHeaders.push(headerValue ?? '');
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: {
                user: {
                  id: '1',
                  email: 'test@example.com',
                  emailVerified: true,
                  createdAt: '2024-01-01',
                },
              },
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      });

      service = new AuthService({ baseUrl: 'https://csrf.concurrent' });
      const first = service.signIn('first@example.com', 'password123');
      const second = service.signIn('second@example.com', 'password123');

      deferred.resolve(jsonResponse({ success: true, data: { csrfToken: 'csrf-1' } }));

      await Promise.all([first, second]);

      expect(csrfCalls).toBe(1);
      expect(loginHeaders).toEqual(['csrf-1', 'csrf-1']);
    });

    it('retries once when the csrf token is invalid', async () => {
      clearCsrfCookie();
      const loginHeaders: string[] = [];
      const csrfTokens = ['csrf-1', 'csrf-2'];
      let loginCalls = 0;

      mockFetch.mockImplementation((input, init) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) {
          return Promise.resolve(jsonResponse({ success: false, error: 'No session' }));
        }
        if (url.endsWith('/auth/csrf')) {
          const token = csrfTokens.shift() ?? 'csrf-final';
          return Promise.resolve(jsonResponse({ success: true, data: { csrfToken: token } }));
        }
        if (url.endsWith('/auth/login')) {
          const headerValue = getHeaderValue(init?.headers, 'x-csrf-token');
          loginHeaders.push(headerValue ?? '');
          loginCalls += 1;
          if (loginCalls === 1) {
            return Promise.resolve(jsonResponse({ success: false, error: 'CSRF_TOKEN_INVALID' }));
          }
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: {
                user: {
                  id: '2',
                  email: 'retry@example.com',
                  emailVerified: true,
                  createdAt: '2024-01-01',
                },
              },
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      });

      service = new AuthService({ baseUrl: 'https://csrf.retry' });
      const result = await service.signIn('retry@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(loginHeaders).toEqual(['csrf-1', 'csrf-2']);
    });

    it('continues without csrf header when token is unavailable', async () => {
      clearCsrfCookie();
      let csrfHeader: string | null = null;

      mockFetch.mockImplementation((input, init) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) {
          return Promise.resolve(jsonResponse({ success: false, error: 'No session' }));
        }
        if (url.endsWith('/auth/csrf')) {
          return Promise.resolve(jsonResponse({ success: false }, 'text/plain'));
        }
        if (url.endsWith('/auth/login')) {
          csrfHeader = getHeaderValue(init?.headers, 'x-csrf-token');
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: {
                user: {
                  id: '3',
                  email: 'fallback@example.com',
                  emailVerified: true,
                  createdAt: '2024-01-01',
                },
              },
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      });

      service = new AuthService({ baseUrl: 'https://csrf.unavailable' });
      const result = await service.signIn('fallback@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(csrfHeader).toBeNull();
    });
  });

  describe('signOut', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should sign out successfully', async () => {
      // First sign in
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: true,
        createdAt: '2024-01-01',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });
      await service.signIn('test@example.com', 'password123');

      // Then sign out
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });
      const result = await service.signOut();

      expect(result.success).toBe(true);
      expect(service.currentUser).toBeNull();
    });
  });

  describe('verifyEmail', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should verify email successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { verified: true } }),
      });

      const result = await service.verifyEmail('valid-token');

      expect(result.success).toBe(true);
      expect(result.data?.verified).toBe(true);
    });
  });

  describe('requestPasswordReset', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should request password reset successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { requested: true } }),
      });

      const result = await service.requestPasswordReset('test@example.com');

      expect(result.success).toBe(true);
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should reset password successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { reset: true } }),
      });

      const result = await service.resetPassword('valid-token', 'newPassword123');

      expect(result.success).toBe(true);
    });
  });

  describe('observables', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should emit user changes via user$', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: true,
        createdAt: '2024-01-01',
      };
      const users: (typeof mockUser | null)[] = [];

      service.user$.subscribe((user) => users.push(user));

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
      });
      await service.signIn('test@example.com', 'password123');

      expect(users).toContain(mockUser);
    });

    it('should expose loading$ observable', () => {
      let loading: boolean | undefined;
      service.loading$.subscribe((l) => {
        loading = l;
      });
      expect(typeof loading).toBe('boolean');
    });

    it('should expose error$ observable', () => {
      let error: string | null | undefined;
      service.error$.subscribe((e) => {
        error = e;
      });
      expect(error === null || typeof error === 'string').toBe(true);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'No session' }),
      });
      service = new AuthService();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle non-Error exceptions in apiRequest', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
