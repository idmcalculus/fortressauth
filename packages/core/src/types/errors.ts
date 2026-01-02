export type AuthErrorCode =
  | 'INVALID_EMAIL'
  | 'INVALID_PASSWORD'
  | 'PASSWORD_TOO_WEAK'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'EMAIL_NOT_VERIFIED'
  | 'EMAIL_VERIFICATION_INVALID'
  | 'EMAIL_VERIFICATION_EXPIRED'
  | 'PASSWORD_RESET_INVALID'
  | 'PASSWORD_RESET_EXPIRED'
  | 'SESSION_EXPIRED'
  | 'SESSION_INVALID'
  | 'EMAIL_EXISTS'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

/**
 * Error code mapping for production-safe error messages.
 * Each error code maps to a unique identifier and user-friendly message.
 */
export interface ErrorCodeMapping {
  /** Unique error code for documentation reference (e.g., AUTH_001) */
  code: string;
  /** User-friendly error message safe for production */
  message: string;
  /** Recommended HTTP status code for this error */
  httpStatus: number;
}

/**
 * Error code reference table mapping AuthErrorCode to production-safe codes and messages.
 * These codes can be referenced in documentation for debugging.
 */
export const ERROR_CODE_MAP: Record<AuthErrorCode, ErrorCodeMapping> = {
  INVALID_CREDENTIALS: {
    code: 'AUTH_001',
    message: 'Authentication failed. Please check your credentials.',
    httpStatus: 401,
  },
  EMAIL_EXISTS: {
    code: 'AUTH_002',
    message: 'Unable to complete registration.',
    httpStatus: 400,
  },
  PASSWORD_TOO_WEAK: {
    code: 'AUTH_003',
    message: 'Password does not meet requirements.',
    httpStatus: 400,
  },
  ACCOUNT_LOCKED: {
    code: 'AUTH_004',
    message: 'Account temporarily unavailable.',
    httpStatus: 401,
  },
  EMAIL_NOT_VERIFIED: {
    code: 'AUTH_005',
    message: 'Please verify your email to continue.',
    httpStatus: 403,
  },
  SESSION_INVALID: {
    code: 'AUTH_006',
    message: 'Session is invalid. Please sign in again.',
    httpStatus: 401,
  },
  SESSION_EXPIRED: {
    code: 'AUTH_007',
    message: 'Session has expired. Please sign in again.',
    httpStatus: 401,
  },
  RATE_LIMIT_EXCEEDED: {
    code: 'AUTH_008',
    message: 'Too many requests. Please try again later.',
    httpStatus: 429,
  },
  INTERNAL_ERROR: {
    code: 'AUTH_009',
    message: 'An unexpected error occurred.',
    httpStatus: 500,
  },
  EMAIL_VERIFICATION_INVALID: {
    code: 'AUTH_010',
    message: 'Invalid verification link.',
    httpStatus: 400,
  },
  EMAIL_VERIFICATION_EXPIRED: {
    code: 'AUTH_011',
    message: 'Verification link has expired.',
    httpStatus: 410,
  },
  PASSWORD_RESET_INVALID: {
    code: 'AUTH_012',
    message: 'Invalid password reset link.',
    httpStatus: 400,
  },
  PASSWORD_RESET_EXPIRED: {
    code: 'AUTH_013',
    message: 'Password reset link has expired.',
    httpStatus: 410,
  },
  INVALID_EMAIL: {
    code: 'AUTH_014',
    message: 'Invalid email format.',
    httpStatus: 400,
  },
  INVALID_PASSWORD: {
    code: 'AUTH_015',
    message: 'Invalid password format.',
    httpStatus: 400,
  },
};

/**
 * Get the error code mapping for a given AuthErrorCode.
 * Falls back to INTERNAL_ERROR if the error code is not found.
 */
export function getErrorCodeMapping(errorCode: AuthErrorCode): ErrorCodeMapping {
  return ERROR_CODE_MAP[errorCode] ?? ERROR_CODE_MAP.INTERNAL_ERROR;
}
