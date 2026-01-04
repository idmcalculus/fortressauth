import { SendEmailCommand } from '@aws-sdk/client-ses';
import { describe, expect, it, vi } from 'vitest';
import { SESEmailProvider } from '../index.js';

describe('SESEmailProvider', () => {
  it('formats from address with a name when provided', () => {
    const provider = new SESEmailProvider({
      region: 'us-east-1',
      fromEmail: 'noreply@example.com',
      fromName: 'Test App',
      client: { send: vi.fn().mockResolvedValue(undefined) },
    });

    expect((provider as unknown as { from: string }).from).toBe('Test App <noreply@example.com>');
  });

  it('sends verification email with rendered templates', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const provider = new SESEmailProvider({
      region: 'us-east-1',
      fromEmail: 'noreply@example.com',
      client: { send },
    });

    await provider.sendVerificationEmail('user@example.com', 'https://example.com/verify');

    expect(send).toHaveBeenCalledWith(expect.any(SendEmailCommand));
    const command = send.mock.calls[0]?.[0] as SendEmailCommand;
    expect(command.input?.Destination?.ToAddresses).toEqual(['user@example.com']);
    expect(command.input?.Message?.Subject?.Data).toBe('Verify your email address');
    expect(command.input?.Message?.Body?.Text?.Data).toContain('https://example.com/verify');
  });
});
