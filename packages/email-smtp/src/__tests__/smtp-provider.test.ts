import type { AddressInfo } from 'node:net';
import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';
import { SMTPServer } from 'smtp-server';
import { describe, expect, it, vi } from 'vitest';
import { SMTPEmailProvider } from '../index.js';

describe('SMTPEmailProvider', () => {
  it('sends email via transport', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const provider = new SMTPEmailProvider({
      host: 'smtp.example.com',
      port: 587,
      fromEmail: 'noreply@example.com',
      transporter: { sendMail } as unknown as Transporter,
    });

    await provider.sendPasswordResetEmail('user@example.com', 'https://example.com/reset');

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'noreply@example.com',
        subject: 'Reset your password',
      }),
    );
  });

  it('uses default secure option and formats from name', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const createTransportSpy = vi
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as unknown as Transporter);

    const provider = new SMTPEmailProvider({
      host: 'smtp.example.com',
      port: 587,
      fromEmail: 'noreply@example.com',
      fromName: 'FortressAuth',
    });

    await provider.sendVerificationEmail('user@example.com', 'https://example.com/verify');

    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: false,
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'FortressAuth <noreply@example.com>',
        subject: 'Verify your email address',
      }),
    );

    createTransportSpy.mockRestore();
  });
});

describe('SMTPEmailProvider integration', () => {
  it('delivers email to SMTP server', async () => {
    let resolveMessage: (value: string) => void = () => {};
    const messagePromise = new Promise<string>((resolve) => {
      resolveMessage = resolve;
    });

    const server = new SMTPServer({
      authOptional: true,
      onData(stream, _session, callback) {
        let data = '';
        stream.on('data', (chunk) => {
          data += chunk.toString();
        });
        stream.on('end', () => {
          resolveMessage(data);
          callback();
        });
      },
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.server.address() as AddressInfo).port;

    const provider = new SMTPEmailProvider({
      host: '127.0.0.1',
      port,
      secure: false,
      tls: { rejectUnauthorized: false },
      fromEmail: 'noreply@example.com',
    });

    await provider.sendVerificationEmail('test@example.com', 'https://example.com/verify');

    const message = await messagePromise;
    server.close();

    expect(message).toContain('Subject: Verify your email address');
    expect(message).toContain('https://example.com/verify');
  });
});
