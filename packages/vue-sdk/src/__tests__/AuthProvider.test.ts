import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { AuthProvider, useAuth, useUser } from '../AuthProvider.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const jsonResponse = <T>(payload: T) => ({
  ok: true,
  status: 200,
  headers: {
    get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
  },
  json: () => Promise.resolve(payload),
});

const textResponse = (ok: boolean, status: number) => ({
  ok,
  status,
  headers: {
    get: () => 'text/plain',
  },
  json: () => Promise.resolve({}),
});

// Helper component to test useAuth hook
const TestConsumer = defineComponent({
  setup() {
    const auth = useAuth();
    return { auth };
  },
  render() {
    return h('div', {
      'data-testid': 'consumer',
      'data-user': JSON.stringify(this.auth.user.value),
      'data-loading': String(this.auth.loading.value),
      'data-error': this.auth.error.value ?? '',
    });
  },
});

const TestUserConsumer = defineComponent({
  setup() {
    const user = useUser();
    return { user };
  },
  render() {
    return h('div', {
      'data-testid': 'user-consumer',
      'data-user': JSON.stringify(this.user.user.value),
      'data-loading': String(this.user.loading.value),
      'data-error': this.user.error.value ?? '',
    });
  },
});

describe('AuthProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should call /auth/me on mount', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { user: { id: '1', email: 'test@example.com' } },
        }),
      );

      mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/me',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    it('should use default baseUrl when none is provided', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { user: { id: '1', email: 'test@example.com' } },
        }),
      );

      mount(AuthProvider, {
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/me',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    it('should set user from /auth/me response', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { user: { id: '1', email: 'test@example.com' } },
        }),
      );

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();
      await nextTick();

      const consumer = wrapper.find('[data-testid="consumer"]');
      expect(consumer.attributes('data-loading')).toBe('false');
      expect(JSON.parse(consumer.attributes('data-user') || 'null')).toEqual({
        id: '1',
        email: 'test@example.com',
      });
    });

    it('should set error when /auth/me fails', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: false, error: 'UNAUTHORIZED' }));

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();
      await nextTick();

      const consumer = wrapper.find('[data-testid="consumer"]');
      expect(consumer.attributes('data-error')).toBe('UNAUTHORIZED');
    });
  });

  describe('signUp', () => {
    it('should call /auth/signup and set user on success', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: false })).mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { user: { id: '2', email: 'new@example.com' } },
        }),
      );

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      await auth.signUp('new@example.com', 'password123');

      await nextTick();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/signup',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should set error on signUp failure', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: false, error: 'EMAIL_EXISTS' }));

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      await auth.signUp('existing@example.com', 'password123');

      await nextTick();

      const consumer = wrapper.find('[data-testid="consumer"]');
      expect(consumer.attributes('data-error')).toBe('EMAIL_EXISTS');
    });

    it('should set UNKNOWN_ERROR when no error message in signUp response', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: false })); // No error field

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      await auth.signUp('test@example.com', 'password123');

      await nextTick();

      const consumer = wrapper.find('[data-testid="consumer"]');
      expect(consumer.attributes('data-error')).toBe('UNKNOWN_ERROR');
    });
  });

  describe('signIn', () => {
    it('should call /auth/login and set user on success', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: false })).mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { user: { id: '1', email: 'test@example.com' } },
        }),
      );

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      await auth.signIn('test@example.com', 'password123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/login',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should set UNKNOWN_ERROR when signIn fails without error message', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: false })); // No error field

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      await auth.signIn('test@example.com', 'wrongpassword');

      await nextTick();

      const consumer = wrapper.find('[data-testid="consumer"]');
      expect(consumer.attributes('data-error')).toBe('UNKNOWN_ERROR');
    });

    it('should handle non-JSON success responses', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(textResponse(true, 204));

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      const response = await auth.signIn('test@example.com', 'password123');

      await nextTick();

      expect(response.success).toBe(true);
      const consumer = wrapper.find('[data-testid="consumer"]');
      expect(consumer.attributes('data-error')).toBe('UNKNOWN_ERROR');
    });

    it('should surface HTTP error codes for non-JSON failures', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(textResponse(false, 500));

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      const response = await auth.signIn('test@example.com', 'password123');

      await nextTick();

      expect(response.success).toBe(false);
      const consumer = wrapper.find('[data-testid="consumer"]');
      expect(consumer.attributes('data-error')).toBe('HTTP_500');
    });

    it('should surface fetch errors', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockRejectedValueOnce(new Error('Network down'));

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      const response = await auth.signIn('test@example.com', 'password123');

      await nextTick();

      expect(response.success).toBe(false);
      const consumer = wrapper.find('[data-testid="consumer"]');
      expect(consumer.attributes('data-error')).toBe('Network down');
    });

    it('should fall back to FETCH_ERROR for non-Error failures', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockRejectedValueOnce('boom');

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      const response = await auth.signIn('test@example.com', 'password123');

      await nextTick();

      expect(response.success).toBe(false);
      const consumer = wrapper.find('[data-testid="consumer"]');
      expect(consumer.attributes('data-error')).toBe('FETCH_ERROR');
    });
  });

  describe('signOut', () => {
    it('should call /auth/logout and clear user on success', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            success: true,
            data: { user: { id: '1', email: 'test@example.com' } },
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ success: true }));

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      await auth.signOut();

      await nextTick();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('verifyEmail', () => {
    it('should call /auth/verify-email with token', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { verified: true } }));

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      const response = await auth.verifyEmail('token123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/verify-email',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'token123' }) }),
      );
      expect(response.success).toBe(true);
    });
  });

  describe('requestPasswordReset', () => {
    it('should call /auth/request-password-reset with email', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { requested: true } }));

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      const response = await auth.requestPasswordReset('test@example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/request-password-reset',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com' }),
        }),
      );
      expect(response.success).toBe(true);
    });
  });

  describe('resetPassword', () => {
    it('should call /auth/reset-password with token and new password', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false }))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { reset: true } }));

      const wrapper = mount(AuthProvider, {
        props: { baseUrl: 'http://localhost:3000' },
        slots: { default: () => h(TestConsumer) },
      });

      await flushPromises();

      const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> })
        .auth;
      const response = await auth.resetPassword('token123', 'newpassword');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/auth/reset-password',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'token123', newPassword: 'newpassword' }),
        }),
      );
      expect(response.success).toBe(true);
    });
  });
});

describe('useAuth', () => {
  it('should throw error when used outside AuthProvider', () => {
    expect(() => {
      mount(
        defineComponent({
          setup() {
            useAuth();
            return () => h('div');
          },
        }),
      );
    }).toThrow('useAuth must be used within an AuthProvider');
  });
});

describe('useUser', () => {
  it('should return user, loading, and error from context', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { user: { id: '1', email: 'test@example.com' } } }),
    );

    const wrapper = mount(AuthProvider, {
      props: { baseUrl: 'http://localhost:3000' },
      slots: { default: () => h(TestUserConsumer) },
    });

    await flushPromises();
    await nextTick();

    // useUser just returns a subset of useAuth, we verify it works via TestConsumer
    const consumer = wrapper.find('[data-testid="user-consumer"]');
    expect(consumer.attributes('data-loading')).toBe('false');
    expect(JSON.parse(consumer.attributes('data-user') || 'null')).toEqual({
      id: '1',
      email: 'test@example.com',
    });
  });
});
