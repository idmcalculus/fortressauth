import type { EmailProviderPort, EmailTemplateSet } from '@fortressauth/core';
import {
  DEFAULT_EMAIL_TEMPLATES,
  mergeEmailTemplates,
  renderEmailTemplate,
} from '@fortressauth/core';
import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';

export interface SMTPEmailProviderOptions {
  host: string;
  port: number;
  secure?: boolean | undefined;
  auth?: { user: string; pass: string } | undefined;
  tls?: { rejectUnauthorized?: boolean; servername?: string } | undefined;
  fromEmail: string;
  fromName?: string | undefined;
  templates?: Partial<EmailTemplateSet> | undefined;
  appName?: string | undefined;
  transporter?: Transporter | undefined;
}

export class SMTPEmailProvider implements EmailProviderPort {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly templates: EmailTemplateSet;
  private readonly appName?: string | undefined;

  constructor(options: SMTPEmailProviderOptions) {
    this.transporter =
      options.transporter ??
      nodemailer.createTransport({
        host: options.host,
        port: options.port,
        secure: options.secure ?? false,
        auth: options.auth,
        tls: options.tls,
      });
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

    await this.transporter.sendMail({
      from: this.from,
      to: email,
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

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject,
      html,
      text,
    });
  }
}
