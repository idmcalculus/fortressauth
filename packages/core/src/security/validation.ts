export interface PasswordConfig {
  minLength?: number;
  maxLength?: number;
  checkCommonPasswords?: boolean;
}

const COMMON_PASSWORDS = new Set([
  'password',
  '123456',
  '12345678',
  'qwerty',
  'abc123',
  'monkey',
  '1234567',
  'letmein',
  'trustno1',
  'dragon',
  'baseball',
  'iloveyou',
  'master',
  'sunshine',
  'ashley',
  'bailey',
  'passw0rd',
  'shadow',
  '123123',
  '654321',
  'superman',
  'qazwsx',
  'michael',
  'football',
]);

export function validatePassword(
  password: string,
  config: PasswordConfig = {},
): { valid: boolean; errors: string[] } {
  const minLength = config.minLength ?? 8;
  const maxLength = config.maxLength ?? 128;
  const checkCommonPasswords = config.checkCommonPasswords ?? true;

  const errors: string[] = [];

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }

  if (password.length > maxLength) {
    errors.push(`Password must not exceed ${maxLength} characters`);
  }

  if (checkCommonPasswords && COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
