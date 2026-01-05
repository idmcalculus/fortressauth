import type { EmailProviderPort, EmailTemplateSet } from '@fortressauth/core';
import {
  DEFAULT_EMAIL_TEMPLATES,
  mergeEmailTemplates,
  renderEmailTemplate,
} from '@fortressauth/core';
import sgMail from '@sendgrid/mail';

export interface SendGridClientLike {
  setApiKey: (apiKey: string) => void;
  send: (message: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
  }) => Promise<unknown>;
}

export interface SendGridEmailProviderOptions {
  apiKey: string;
  fromEmail: string;
  fromName?: string | undefined;
  templates?: Partial<EmailTemplateSet> | undefined;
  appName?: string | undefined;
  client?: SendGridClientLike | undefined;
}

export class SendGridEmailProvider implements EmailProviderPort {
  private readonly client: SendGridClientLike;
  private readonly from: string;
  private readonly templates: EmailTemplateSet;
  private readonly appName?: string | undefined;

  constructor(options: SendGridEmailProviderOptions) {
    this.client = options.client ?? sgMail;
    this.client.setApiKey(options.apiKey);
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

    await this.client.send({
      to: email,
      from: this.from,
      subject,
      html,
      text,
    });
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    const { subject, html, text } = renderEmailTemplate(this.templates.passwordReset, {
      email,
      link: resetLink,
      appName: this.appName,
    });

    await this.client.send({
      to: email,
      from: this.from,
      subject,
      html,
      text,
    });
  }
}
