export interface EmailTemplateParams {
  email: string;
  link: string;
  appName?: string | undefined;
}

export type EmailTemplateValue = string | ((params: EmailTemplateParams) => string);

export interface EmailTemplate {
  subject: EmailTemplateValue;
  html: EmailTemplateValue;
  text: EmailTemplateValue;
}

export interface EmailTemplateSet {
  verification: EmailTemplate;
  passwordReset: EmailTemplate;
}

function resolveTemplateValue(value: EmailTemplateValue, params: EmailTemplateParams): string {
  return typeof value === 'function' ? value(params) : value;
}

export function renderEmailTemplate(
  template: EmailTemplate,
  params: EmailTemplateParams,
): { subject: string; html: string; text: string } {
  return {
    subject: resolveTemplateValue(template.subject, params),
    html: resolveTemplateValue(template.html, params),
    text: resolveTemplateValue(template.text, params),
  };
}

export function mergeEmailTemplates(
  defaults: EmailTemplateSet,
  overrides?: Partial<EmailTemplateSet>,
): EmailTemplateSet {
  return {
    verification: { ...defaults.verification, ...(overrides?.verification ?? {}) },
    passwordReset: { ...defaults.passwordReset, ...(overrides?.passwordReset ?? {}) },
  };
}

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplateSet = {
  verification: {
    subject: ({ appName }) => `Verify your email address${appName ? ` for ${appName}` : ''}`,
    html: ({ link, appName }) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Verify your email address</h1>
        <p>Thanks for signing up${appName ? ` for ${appName}` : ''}. Click the link below to verify your email:</p>
        <p><a href="${link}" style="color: #0066cc;">${link}</a></p>
        <p style="color: #666; font-size: 14px;">If you didn't request this email, you can safely ignore it.</p>
      </div>
    `,
    text: ({ link, appName }) =>
      `Verify your email address${appName ? ` for ${appName}` : ''}:\n${link}\nIf you didn't request this email, you can safely ignore it.`,
  },
  passwordReset: {
    subject: ({ appName }) => `Reset your password${appName ? ` for ${appName}` : ''}`,
    html: ({ link, appName }) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Reset your password</h1>
        <p>We received a request to reset your password${appName ? ` for ${appName}` : ''}. Click the link below to proceed:</p>
        <p><a href="${link}" style="color: #0066cc;">${link}</a></p>
        <p style="color: #666; font-size: 14px;">If you didn't request this email, you can safely ignore it.</p>
      </div>
    `,
    text: ({ link, appName }) =>
      `Reset your password${appName ? ` for ${appName}` : ''}:\n${link}\nIf you didn't request this email, you can safely ignore it.`,
  },
};
