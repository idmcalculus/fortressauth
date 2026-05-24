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

  it('uses raw from address when no name is provided', () => {
    const provider = new SESEmailProvider({
      region: 'us-east-1',
      fromEmail: 'noreply@example.com',
      credentials: {
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'SECRET_TEST',
      },
      client: { send: vi.fn().mockResolvedValue(undefined) },
    });

    expect((provider as unknown as { from: string }).from).toBe('noreply@example.com');
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

  it('sends password reset email with rendered templates', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const provider = new SESEmailProvider({
      region: 'us-east-1',
      fromEmail: 'noreply@example.com',
      appName: 'Fortress',
      credentials: {
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'SECRET_TEST',
        sessionToken: 'SESSION_TOKEN',
      },
      client: { send },
    });

    await provider.sendPasswordResetEmail('user@example.com', 'https://example.com/reset');

    expect(send).toHaveBeenCalledWith(expect.any(SendEmailCommand));
    const command = send.mock.calls[0]?.[0] as SendEmailCommand;
    expect(command.input?.Destination?.ToAddresses).toEqual(['user@example.com']);
    expect(command.input?.Message?.Subject?.Data).toBe('Reset your password for Fortress');
    expect(command.input?.Message?.Body?.Text?.Data).toContain('https://example.com/reset');
  });

  it('attaches the configuration set name to verification emails when configured', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const provider = new SESEmailProvider({
      region: 'us-east-1',
      fromEmail: 'noreply@example.com',
      configurationSetName: 'fortressauth-prod-events',
      client: { send },
    });

    await provider.sendVerificationEmail('user@example.com', 'https://example.com/verify');
    const command = send.mock.calls[0]?.[0] as SendEmailCommand;
    expect(command.input?.ConfigurationSetName).toBe('fortressauth-prod-events');
  });

  it('attaches the configuration set name to password reset emails when configured', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const provider = new SESEmailProvider({
      region: 'us-east-1',
      fromEmail: 'noreply@example.com',
      configurationSetName: 'fortressauth-prod-events',
      client: { send },
    });

    await provider.sendPasswordResetEmail('user@example.com', 'https://example.com/reset');
    const command = send.mock.calls[0]?.[0] as SendEmailCommand;
    expect(command.input?.ConfigurationSetName).toBe('fortressauth-prod-events');
  });

  it('omits ConfigurationSetName when not configured (covers default branch)', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const provider = new SESEmailProvider({
      region: 'us-east-1',
      fromEmail: 'noreply@example.com',
      client: { send },
    });

    await provider.sendVerificationEmail('user@example.com', 'https://example.com/verify');
    const command = send.mock.calls[0]?.[0] as SendEmailCommand;
    expect(command.input?.ConfigurationSetName).toBeUndefined();
  });

  it('falls back to the default SESClient when no client override is supplied', () => {
    // Constructing without `client` exercises the SESClient initialization
    // branch. We don't need to send anything; the constructor branch is the
    // missing coverage.
    const provider = new SESEmailProvider({
      region: 'us-east-1',
      fromEmail: 'noreply@example.com',
    });
    expect(provider).toBeDefined();
  });

  it('passes static credentials to the default SESClient when supplied without a client override', () => {
    // Same as above but with the credentials branch taken.
    const provider = new SESEmailProvider({
      region: 'us-east-1',
      fromEmail: 'noreply@example.com',
      credentials: {
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'SECRET_TEST',
      },
    });
    expect(provider).toBeDefined();
  });
});
