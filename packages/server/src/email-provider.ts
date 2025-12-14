import type { EmailProviderPort } from '@fortressauth/core';
import { Resend } from 'resend';

export class ConsoleEmailProvider implements EmailProviderPort {
  async sendVerificationEmail(email: string, verificationLink: string): Promise<void> {
    console.info(`[email] Verification for ${email}: ${verificationLink}`);
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    console.info(`[email] Password reset for ${email}: ${resetLink}`);
  }
}

export interface ResendEmailProviderOptions {
  apiKey: string;
  fromEmail: string;
  fromName?: string | undefined;
}

export class ResendEmailProvider implements EmailProviderPort {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(options: ResendEmailProviderOptions) {
    this.resend = new Resend(options.apiKey);
    this.from = options.fromName ? `${options.fromName} <${options.fromEmail}>` : options.fromEmail;
  }

  async sendVerificationEmail(email: string, verificationLink: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: [email],
      subject: 'Verify your email address',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Verify your email address</h1>
          <p>Click the link below to verify your email address:</p>
          <p><a href="${verificationLink}" style="color: #0066cc;">${verificationLink}</a></p>
          <p style="color: #666; font-size: 14px;">If you didn't request this email, you can safely ignore it.</p>
        </div>
      `,
    });

    if (error) {
      console.error('[email] Failed to send verification email:', error);
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: [email],
      subject: 'Reset your password',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Reset your password</h1>
          <p>Click the link below to reset your password:</p>
          <p><a href="${resetLink}" style="color: #0066cc;">${resetLink}</a></p>
          <p style="color: #666; font-size: 14px;">If you didn't request this email, you can safely ignore it.</p>
        </div>
      `,
    });

    if (error) {
      console.error('[email] Failed to send password reset email:', error);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }
}

export type EmailProviderType = 'console' | 'resend';

export interface EmailProviderConfig {
  provider: EmailProviderType;
  resend?: ResendEmailProviderOptions | undefined;
}

export function createEmailProvider(config: EmailProviderConfig): EmailProviderPort {
  switch (config.provider) {
    case 'resend':
      if (!config.resend) {
        throw new Error('Resend configuration is required when using resend provider');
      }
      return new ResendEmailProvider(config.resend);

    default:
      return new ConsoleEmailProvider();
  }
}
