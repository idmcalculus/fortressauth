import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleEmailProvider, ResendEmailProvider, createEmailProvider } from '../email-provider.js';

describe('Email providers', () => {
	describe('ConsoleEmailProvider', () => {
		let provider: ConsoleEmailProvider;
		let consoleSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			provider = new ConsoleEmailProvider();
			consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => { });
		});

		afterEach(() => {
			consoleSpy.mockRestore();
		});

		it('should log verification email to console', async () => {
			await provider.sendVerificationEmail('test@example.com', 'https://example.com/verify');

			expect(consoleSpy).toHaveBeenCalledWith(
				'[email] Verification for test@example.com: https://example.com/verify'
			);
		});

		it('should log password reset email to console', async () => {
			await provider.sendPasswordResetEmail('test@example.com', 'https://example.com/reset');

			expect(consoleSpy).toHaveBeenCalledWith(
				'[email] Password reset for test@example.com: https://example.com/reset'
			);
		});
	});

	describe('ResendEmailProvider', () => {
		it('should format from address with name when provided', () => {
			const provider = new ResendEmailProvider({
				apiKey: 'test-key',
				fromEmail: 'noreply@example.com',
				fromName: 'Test App',
			});

			// Access private property for testing via any cast
			expect((provider as unknown as { from: string }).from).toBe('Test App <noreply@example.com>');
		});

		it('should use email only when no name provided', () => {
			const provider = new ResendEmailProvider({
				apiKey: 'test-key',
				fromEmail: 'noreply@example.com',
			});

			expect((provider as unknown as { from: string }).from).toBe('noreply@example.com');
		});

		it('should send verification email successfully', async () => {
			const provider = new ResendEmailProvider({
				apiKey: 'test-key',
				fromEmail: 'noreply@example.com',
			});

			// Mock the resend client
			const mockSend = vi.fn().mockResolvedValue({ error: null });
			(provider as unknown as { resend: { emails: { send: typeof mockSend } } }).resend = {
				emails: { send: mockSend },
			};

			await provider.sendVerificationEmail('test@example.com', 'https://example.com/verify');

			expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
				to: ['test@example.com'],
				subject: 'Verify your email address',
			}));
		});

		it('should throw error when verification email fails', async () => {
			const provider = new ResendEmailProvider({
				apiKey: 'test-key',
				fromEmail: 'noreply@example.com',
			});

			const mockSend = vi.fn().mockResolvedValue({ error: { message: 'API error' } });
			(provider as unknown as { resend: { emails: { send: typeof mockSend } } }).resend = {
				emails: { send: mockSend },
			};

			await expect(provider.sendVerificationEmail('test@example.com', 'https://example.com/verify'))
				.rejects.toThrow('Failed to send verification email: API error');
		});

		it('should send password reset email successfully', async () => {
			const provider = new ResendEmailProvider({
				apiKey: 'test-key',
				fromEmail: 'noreply@example.com',
			});

			const mockSend = vi.fn().mockResolvedValue({ error: null });
			(provider as unknown as { resend: { emails: { send: typeof mockSend } } }).resend = {
				emails: { send: mockSend },
			};

			await provider.sendPasswordResetEmail('test@example.com', 'https://example.com/reset');

			expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
				to: ['test@example.com'],
				subject: 'Reset your password',
			}));
		});

		it('should throw error when password reset email fails', async () => {
			const provider = new ResendEmailProvider({
				apiKey: 'test-key',
				fromEmail: 'noreply@example.com',
			});

			const mockSend = vi.fn().mockResolvedValue({ error: { message: 'API error' } });
			(provider as unknown as { resend: { emails: { send: typeof mockSend } } }).resend = {
				emails: { send: mockSend },
			};

			await expect(provider.sendPasswordResetEmail('test@example.com', 'https://example.com/reset'))
				.rejects.toThrow('Failed to send password reset email: API error');
		});
	});

	describe('createEmailProvider', () => {
		it('should create ConsoleEmailProvider by default', () => {
			const provider = createEmailProvider({ provider: 'console' });

			expect(provider).toBeInstanceOf(ConsoleEmailProvider);
		});

		it('should create ResendEmailProvider when configured', () => {
			const provider = createEmailProvider({
				provider: 'resend',
				resend: {
					apiKey: 'test-key',
					fromEmail: 'noreply@example.com',
				},
			});

			expect(provider).toBeInstanceOf(ResendEmailProvider);
		});

		it('should throw error when resend provider missing config', () => {
			expect(() => createEmailProvider({ provider: 'resend' })).toThrow(
				'Resend configuration is required when using resend provider'
			);
		});

		it('should default to console for unknown provider', () => {
			const provider = createEmailProvider({ provider: 'unknown' as 'console' });

			expect(provider).toBeInstanceOf(ConsoleEmailProvider);
		});
	});
});
