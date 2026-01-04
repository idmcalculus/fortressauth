import { describe, expect, it, vi } from 'vitest';
import { SendGridEmailProvider } from '../index.js';

describe('SendGridEmailProvider', () => {
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

  it('sends password reset email with rendered templates', async () => {
    const client = {
      setApiKey: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    const provider = new SendGridEmailProvider({
      apiKey: 'test-key',
      fromEmail: 'noreply@example.com',
      client,
    });

    await provider.sendPasswordResetEmail('user@example.com', 'https://example.com/reset');

    expect(client.setApiKey).toHaveBeenCalledWith('test-key');
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'noreply@example.com',
        subject: 'Reset your password',
      }),
    );
  });
});
