import type { EmailProviderPort, EmailTemplateSet } from '@fortressauth/core';
import {
  DEFAULT_EMAIL_TEMPLATES,
  mergeEmailTemplates,
  renderEmailTemplate,
} from '@fortressauth/core';
import type { SendGridEmailProviderOptions } from '@fortressauth/email-sendgrid';
import { SendGridEmailProvider } from '@fortressauth/email-sendgrid';
import type { SESEmailProviderOptions } from '@fortressauth/email-ses';
import { SESEmailProvider } from '@fortressauth/email-ses';
import type { SMTPEmailProviderOptions } from '@fortressauth/email-smtp';
import { SMTPEmailProvider } from '@fortressauth/email-smtp';
import { Resend } from 'resend';

export interface ConsoleEmailProviderOptions {
  templates?: Partial<EmailTemplateSet> | undefined;
  appName?: string | undefined;
}

export class ConsoleEmailProvider implements EmailProviderPort {
  private readonly templates: EmailTemplateSet;
  private readonly appName?: string | undefined;

  constructor(options: ConsoleEmailProviderOptions = {}) {
    this.templates = mergeEmailTemplates(DEFAULT_EMAIL_TEMPLATES, options.templates);
    this.appName = options.appName;
  }

  async sendVerificationEmail(email: string, verificationLink: string): Promise<void> {
    const { subject } = renderEmailTemplate(this.templates.verification, {
      email,
      link: verificationLink,
      appName: this.appName,
    });
    console.info(`[email] ${subject} for ${email}: ${verificationLink}`);
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    const { subject } = renderEmailTemplate(this.templates.passwordReset, {
      email,
      link: resetLink,
      appName: this.appName,
    });
    console.info(`[email] ${subject} for ${email}: ${resetLink}`);
  }
}

export interface ResendEmailProviderOptions {
  apiKey: string;
  fromEmail: string;
  fromName?: string | undefined;
  templates?: Partial<EmailTemplateSet> | undefined;
  appName?: string | undefined;
}

export class ResendEmailProvider implements EmailProviderPort {
  private readonly resend: Resend;
  private readonly from: string;
  private readonly templates: EmailTemplateSet;
  private readonly appName?: string | undefined;

  constructor(options: ResendEmailProviderOptions) {
    this.resend = new Resend(options.apiKey);
    this.from = options.fromName ? `${options.fromName} <${options.fromEmail}>` : options.fromEmail;
    this.templates = mergeEmailTemplates(DEFAULT_EMAIL_TEMPLATES, options.templates);
    this.appName = options.appName;
  }

  async sendVerificationEmail(email: string, verificationLink: string): Promise<void> {
    const { subject, html, text } = renderEmailTemplate(this.templates.verification, {
      email,
      link: verificationLink,
      appName: this.appName,
    });
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: [email],
      subject,
      html,
      text,
    });

    if (error) {
      console.error('[email] Failed to send verification email:', error);
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    const { subject, html, text } = renderEmailTemplate(this.templates.passwordReset, {
      email,
      link: resetLink,
      appName: this.appName,
    });
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: [email],
      subject,
      html,
      text,
    });

    if (error) {
      console.error('[email] Failed to send password reset email:', error);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }
}

export type EmailProviderType = 'console' | 'resend' | 'ses' | 'sendgrid' | 'smtp';

export interface EmailProviderConfig {
  provider: EmailProviderType;
  console?: ConsoleEmailProviderOptions | undefined;
  resend?: ResendEmailProviderOptions | undefined;
  ses?: SESEmailProviderOptions | undefined;
  sendgrid?: SendGridEmailProviderOptions | undefined;
  smtp?: SMTPEmailProviderOptions | undefined;
}

export function createEmailProvider(config: EmailProviderConfig): EmailProviderPort {
  switch (config.provider) {
    case 'resend':
      if (!config.resend) {
        throw new Error('Resend configuration is required when using resend provider');
      }
      return new ResendEmailProvider(config.resend);
    case 'ses':
      if (!config.ses) {
        throw new Error('SES configuration is required when using ses provider');
      }
      return new SESEmailProvider(config.ses);
    case 'sendgrid':
      if (!config.sendgrid) {
        throw new Error('SendGrid configuration is required when using sendgrid provider');
      }
      return new SendGridEmailProvider(config.sendgrid);
    case 'smtp':
      if (!config.smtp) {
        throw new Error('SMTP configuration is required when using smtp provider');
      }
      return new SMTPEmailProvider(config.smtp);

    default:
      return new ConsoleEmailProvider(config.console);
  }
}

export { SESEmailProvider, SendGridEmailProvider, SMTPEmailProvider };
