import { z } from 'zod';
import type { AuthErrorCode } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { err, ok } from '../types/result.js';

export const MAX_EMAIL_LENGTH = 254;

const EmailSchema = z.email();

export function containsControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || (code >= 127 && code <= 159)) {
      return true;
    }
  }
  return false;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmailInput(email: string): Result<string, AuthErrorCode> {
  if (containsControlCharacters(email)) {
    return err('INVALID_EMAIL');
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    return err('INVALID_EMAIL');
  }

  const normalized = normalizeEmail(email);
  const parsed = EmailSchema.safeParse(normalized);

  if (!parsed.success) {
    return err('INVALID_EMAIL');
  }

  return ok(parsed.data);
}

export function validatePasswordInput(
  password: string,
  maxLength: number,
): Result<void, AuthErrorCode> {
  if (containsControlCharacters(password)) {
    return err('INVALID_PASSWORD');
  }

  if (password.length > maxLength) {
    return err('INVALID_PASSWORD');
  }

  return ok(undefined);
}
