import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { EmailProviderPort, EmailTemplateSet } from '@fortressauth/core';
import {
  DEFAULT_EMAIL_TEMPLATES,
  mergeEmailTemplates,
  renderEmailTemplate,
} from '@fortressauth/core';

export interface SESClientLike {
  send(command: SendEmailCommand): Promise<unknown>;
}

export interface SESEmailProviderOptions {
  region: string;
  fromEmail: string;
  fromName?: string | undefined;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string | undefined;
  };
  templates?: Partial<EmailTemplateSet> | undefined;
  appName?: string | undefined;
  client?: SESClientLike | undefined;
}

export class SESEmailProvider implements EmailProviderPort {
  private readonly client: SESClientLike;
  private readonly from: string;
  private readonly templates: EmailTemplateSet;
  private readonly appName?: string | undefined;

  constructor(options: SESEmailProviderOptions) {
    const credentials = options.credentials
      ? {
          accessKeyId: options.credentials.accessKeyId,
          secretAccessKey: options.credentials.secretAccessKey,
          ...(options.credentials.sessionToken
            ? { sessionToken: options.credentials.sessionToken }
            : {}),
        }
      : undefined;
    const clientConfig = {
      region: options.region,
      ...(credentials ? { credentials } : {}),
    };
    this.client = options.client ?? new SESClient(clientConfig);
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

    await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
        },
      }),
    );
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    const { subject, html, text } = renderEmailTemplate(this.templates.passwordReset, {
      email,
      link: resetLink,
      appName: this.appName,
    });

    await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
        },
      }),
    );
  }
}
