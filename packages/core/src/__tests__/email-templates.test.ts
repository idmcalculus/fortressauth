import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMAIL_TEMPLATES,
  mergeEmailTemplates,
  renderEmailTemplate,
} from '../email-templates.js';

describe('email templates', () => {
  it('renders string and function values', () => {
    const template = {
      subject: 'Welcome!',
      html: ({ link }: { link: string }) => `<a href="${link}">Verify</a>`,
      text: ({ email }: { email: string }) => `Hello ${email}`,
    };

    const rendered = renderEmailTemplate(template, {
      email: 'user@example.com',
      link: 'https://example.com/verify',
      appName: 'FortressAuth',
    });

    expect(rendered).toEqual({
      subject: 'Welcome!',
      html: '<a href="https://example.com/verify">Verify</a>',
      text: 'Hello user@example.com',
    });
  });

  it('merges overrides with defaults', () => {
    const merged = mergeEmailTemplates(DEFAULT_EMAIL_TEMPLATES, {
      verification: {
        subject: 'Custom subject',
        html: DEFAULT_EMAIL_TEMPLATES.verification.html,
        text: DEFAULT_EMAIL_TEMPLATES.verification.text,
      },
      passwordReset: {
        subject: DEFAULT_EMAIL_TEMPLATES.passwordReset.subject,
        html: DEFAULT_EMAIL_TEMPLATES.passwordReset.html,
        text: 'Custom reset text',
      },
    });

    const params = {
      email: 'person@example.com',
      link: 'https://example.com/reset',
      appName: 'FortressAuth',
    };

    const verification = renderEmailTemplate(merged.verification, params);
    const reset = renderEmailTemplate(merged.passwordReset, params);

    expect(verification.subject).toBe('Custom subject');
    expect(reset.text).toBe('Custom reset text');
    expect(merged.verification.html).toBe(DEFAULT_EMAIL_TEMPLATES.verification.html);
  });

  it('keeps defaults when overrides are omitted', () => {
    const merged = mergeEmailTemplates(DEFAULT_EMAIL_TEMPLATES);

    expect(merged.verification.subject).toBe(DEFAULT_EMAIL_TEMPLATES.verification.subject);
    expect(merged.passwordReset.text).toBe(DEFAULT_EMAIL_TEMPLATES.passwordReset.text);
  });

  it('renders default templates with and without appName', () => {
    const baseParams = {
      email: 'person@example.com',
      link: 'https://example.com/verify',
    };
    const withName = { ...baseParams, appName: 'FortressAuth' };

    const verificationNoName = renderEmailTemplate(
      DEFAULT_EMAIL_TEMPLATES.verification,
      baseParams,
    );
    const verificationWithName = renderEmailTemplate(
      DEFAULT_EMAIL_TEMPLATES.verification,
      withName,
    );

    expect(verificationNoName.subject).toBe('Verify your email address');
    expect(verificationWithName.subject).toBe('Verify your email address for FortressAuth');
    expect(verificationNoName.html).toContain('Verify your email address');
    expect(verificationWithName.html).toContain('for FortressAuth');

    const resetNoName = renderEmailTemplate(DEFAULT_EMAIL_TEMPLATES.passwordReset, baseParams);
    const resetWithName = renderEmailTemplate(DEFAULT_EMAIL_TEMPLATES.passwordReset, withName);

    expect(resetNoName.subject).toBe('Reset your password');
    expect(resetWithName.subject).toBe('Reset your password for FortressAuth');
    expect(resetNoName.text).toContain('Reset your password');
    expect(resetWithName.text).toContain('for FortressAuth');
  });
});
