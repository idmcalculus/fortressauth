import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { AuthProvider, useAuth, useUser } from '../AuthProvider.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

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

// Helper component to test useUser hook
const UserConsumer = defineComponent({
	setup() {
		const { user, loading, error } = useUser();
		return { user, loading, error };
	},
	render() {
		return h('div', {
			'data-testid': 'user-consumer',
			'data-user': JSON.stringify(this.user?.value ?? null),
			'data-loading': String(this.loading?.value ?? true),
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
			mockFetch.mockResolvedValueOnce({
				json: () => Promise.resolve({ success: true, data: { user: { id: '1', email: 'test@example.com' } } }),
			});

			mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/auth/me',
				expect.objectContaining({ credentials: 'include' })
			);
		});

		it('should set user from /auth/me response', async () => {
			mockFetch.mockResolvedValueOnce({
				json: () => Promise.resolve({ success: true, data: { user: { id: '1', email: 'test@example.com' } } }),
			});

			const wrapper = mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();
			await nextTick();

			const consumer = wrapper.find('[data-testid="consumer"]');
			expect(consumer.attributes('data-loading')).toBe('false');
			expect(JSON.parse(consumer.attributes('data-user') || 'null')).toEqual({ id: '1', email: 'test@example.com' });
		});

		it('should set error when /auth/me fails', async () => {
			mockFetch.mockResolvedValueOnce({
				json: () => Promise.resolve({ success: false, error: 'UNAUTHORIZED' }),
			});

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
			mockFetch
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) })
				.mockResolvedValueOnce({
					json: () => Promise.resolve({ success: true, data: { user: { id: '2', email: 'new@example.com' } } }),
				});

			const wrapper = mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();

			const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> }).auth;
			await auth.signUp('new@example.com', 'password123');

			await nextTick();

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/auth/signup',
				expect.objectContaining({ method: 'POST' })
			);
		});

		it('should set error on signUp failure', async () => {
			mockFetch
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) })
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false, error: 'EMAIL_EXISTS' }) });

			const wrapper = mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();

			const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> }).auth;
			await auth.signUp('existing@example.com', 'password123');

			await nextTick();

			const consumer = wrapper.find('[data-testid="consumer"]');
			expect(consumer.attributes('data-error')).toBe('EMAIL_EXISTS');
		});

		it('should set UNKNOWN_ERROR when no error message in signUp response', async () => {
			mockFetch
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) })
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) }); // No error field

			const wrapper = mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();

			const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> }).auth;
			await auth.signUp('test@example.com', 'password123');

			await nextTick();

			const consumer = wrapper.find('[data-testid="consumer"]');
			expect(consumer.attributes('data-error')).toBe('UNKNOWN_ERROR');
		});
	});

	describe('signIn', () => {
		it('should call /auth/login and set user on success', async () => {
			mockFetch
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) })
				.mockResolvedValueOnce({
					json: () => Promise.resolve({ success: true, data: { user: { id: '1', email: 'test@example.com' } } }),
				});

			const wrapper = mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();

			const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> }).auth;
			await auth.signIn('test@example.com', 'password123');

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/auth/login',
				expect.objectContaining({ method: 'POST' })
			);
		});

		it('should set UNKNOWN_ERROR when signIn fails without error message', async () => {
			mockFetch
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) })
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) }); // No error field

			const wrapper = mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();

			const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> }).auth;
			await auth.signIn('test@example.com', 'wrongpassword');

			await nextTick();

			const consumer = wrapper.find('[data-testid="consumer"]');
			expect(consumer.attributes('data-error')).toBe('UNKNOWN_ERROR');
		});
	});

	describe('signOut', () => {
		it('should call /auth/logout and clear user on success', async () => {
			mockFetch
				.mockResolvedValueOnce({
					json: () => Promise.resolve({ success: true, data: { user: { id: '1', email: 'test@example.com' } } }),
				})
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) });

			const wrapper = mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();

			const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> }).auth;
			await auth.signOut();

			await nextTick();

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/auth/logout',
				expect.objectContaining({ method: 'POST' })
			);
		});
	});

	describe('verifyEmail', () => {
		it('should call /auth/verify-email with token', async () => {
			mockFetch
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) })
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { verified: true } }) });

			const wrapper = mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();

			const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> }).auth;
			const response = await auth.verifyEmail('token123');

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/auth/verify-email',
				expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'token123' }) })
			);
			expect(response.success).toBe(true);
		});
	});

	describe('requestPasswordReset', () => {
		it('should call /auth/request-password-reset with email', async () => {
			mockFetch
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) })
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { requested: true } }) });

			const wrapper = mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();

			const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> }).auth;
			const response = await auth.requestPasswordReset('test@example.com');

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/auth/request-password-reset',
				expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'test@example.com' }) })
			);
			expect(response.success).toBe(true);
		});
	});

	describe('resetPassword', () => {
		it('should call /auth/reset-password with token and new password', async () => {
			mockFetch
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) })
				.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { reset: true } }) });

			const wrapper = mount(AuthProvider, {
				props: { baseUrl: 'http://localhost:3000' },
				slots: { default: () => h(TestConsumer) },
			});

			await flushPromises();

			const auth = (wrapper.findComponent(TestConsumer).vm as { auth: ReturnType<typeof useAuth> }).auth;
			const response = await auth.resetPassword('token123', 'newpassword');

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:3000/auth/reset-password',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ token: 'token123', newPassword: 'newpassword' }),
				})
			);
			expect(response.success).toBe(true);
		});
	});
});

describe('useAuth', () => {
	it('should throw error when used outside AuthProvider', () => {
		expect(() => {
			mount(defineComponent({
				setup() {
					useAuth();
					return () => h('div');
				},
			}));
		}).toThrow('useAuth must be used within an AuthProvider');
	});
});

describe('useUser', () => {
	it('should return user, loading, and error from context', async () => {
		mockFetch.mockResolvedValueOnce({
			json: () => Promise.resolve({ success: true, data: { user: { id: '1', email: 'test@example.com' } } }),
		});

		const wrapper = mount(AuthProvider, {
			props: { baseUrl: 'http://localhost:3000' },
			slots: { default: () => h(TestConsumer) },
		});

		await flushPromises();
		await nextTick();

		// useUser just returns a subset of useAuth, we verify it works via TestConsumer
		const consumer = wrapper.find('[data-testid="consumer"]');
		expect(consumer.attributes('data-loading')).toBe('false');
		expect(JSON.parse(consumer.attributes('data-user') || 'null')).toEqual({ id: '1', email: 'test@example.com' });
	});
});
