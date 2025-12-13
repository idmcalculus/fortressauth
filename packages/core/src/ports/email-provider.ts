export interface EmailProviderPort {
  sendVerificationEmail(email: string, verificationLink: string): Promise<void>;
  sendPasswordResetEmail(email: string, resetLink: string): Promise<void>;
}
