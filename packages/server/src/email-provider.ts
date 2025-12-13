import type { EmailProviderPort } from '@fortressauth/core';

export class ConsoleEmailProvider implements EmailProviderPort {
  async sendVerificationEmail(email: string, verificationLink: string): Promise<void> {
    console.info(`[email] Verification for ${email}: ${verificationLink}`);
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    console.info(`[email] Password reset for ${email}: ${resetLink}`);
  }
}
