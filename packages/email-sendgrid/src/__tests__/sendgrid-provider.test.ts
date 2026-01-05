import sgMail from '@sendgrid/mail';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SendGridEmailProvider } from '../index.js';

vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('SendGridEmailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats from address with a name when provided', () => {
    const client = {
      setApiKey: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    const provider = new SendGridEmailProvider({
      apiKey: 'test-key',
      fromEmail: 'noreply@example.com',
      fromName: 'Test App',
      client,
    });

    expect((provider as unknown as { from: string }).from).toBe('Test App <noreply@example.com>');
  });

  it('uses default client when none is provided', async () => {
    const provider = new SendGridEmailProvider({
      apiKey: 'default-key',
      fromEmail: 'noreply@example.com',
    });

    await provider.sendVerificationEmail('user@example.com', 'https://example.com/verify');

    const mockedMail = sgMail as unknown as {
      setApiKey: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
    };

    expect(mockedMail.setApiKey).toHaveBeenCalledWith('default-key');
    expect(mockedMail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'noreply@example.com',
        subject: 'Verify your email address',
      }),
    );
  });

  it('uses raw from address when no name is provided', () => {
    const client = {
      setApiKey: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    const provider = new SendGridEmailProvider({
      apiKey: 'test-key',
      fromEmail: 'noreply@example.com',
      client,
    });

    expect(client.setApiKey).toHaveBeenCalledWith('test-key');
    expect((provider as unknown as { from: string }).from).toBe('noreply@example.com');
  });

  it('sends verification email with rendered templates', async () => {
    const client = {
      setApiKey: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    const provider = new SendGridEmailProvider({
      apiKey: 'test-key',
      fromEmail: 'noreply@example.com',
      appName: 'Fortress',
      client,
    });

    await provider.sendVerificationEmail('user@example.com', 'https://example.com/verify');

    expect(client.setApiKey).toHaveBeenCalledWith('test-key');
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'noreply@example.com',
        subject: 'Verify your email address for Fortress',
        text: expect.stringContaining('https://example.com/verify'),
      }),
    );
  });

  it('sends password reset email with rendered templates', async () => {
    const client = {
      setApiKey: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    const provider = new SendGridEmailProvider({
      apiKey: 'test-key',
      fromEmail: 'noreply@example.com',
      appName: 'Fortress',
      client,
    });

    await provider.sendPasswordResetEmail('user@example.com', 'https://example.com/reset');

    expect(client.setApiKey).toHaveBeenCalledWith('test-key');
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'noreply@example.com',
        subject: 'Reset your password for Fortress',
      }),
    );
  });
});
