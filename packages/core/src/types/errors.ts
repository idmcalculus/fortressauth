export type AuthErrorCode =
  | 'INVALID_EMAIL'
  | 'INVALID_PASSWORD'
  | 'PASSWORD_TOO_WEAK'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'EMAIL_NOT_VERIFIED'
  | 'CSRF_TOKEN_INVALID'
  | 'EMAIL_VERIFICATION_INVALID'
  | 'EMAIL_VERIFICATION_EXPIRED'
  | 'PASSWORD_RESET_INVALID'
  | 'PASSWORD_RESET_EXPIRED'
  | 'SESSION_EXPIRED'
  | 'SESSION_INVALID'
  | 'EMAIL_EXISTS'
  | 'OAUTH_AUTH_FAILED'
  | 'OAUTH_STATE_MISMATCH'
  | 'OAUTH_USER_INFO_FAILED'
  | 'OAUTH_NOT_SUPPORTED'
  | 'NATIVE_AUTHORIZATION_INVALID'
  | 'NATIVE_REDIRECT_URI_INVALID'
  | 'NATIVE_AUDIENCE_INVALID'
  | 'STEP_UP_UNSUPPORTED'
  | 'STEP_UP_FAILED'
  | 'ACCOUNT_DISABLED'
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
  CSRF_TOKEN_INVALID: {
    code: 'AUTH_016',
    message: 'Security verification failed. Please try again.',
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
  OAUTH_AUTH_FAILED: {
    code: 'AUTH_017',
    message: 'Authentication with the external provider failed.',
    httpStatus: 401,
  },
  OAUTH_STATE_MISMATCH: {
    code: 'AUTH_018',
    message: 'Security verification failed for external login.',
    httpStatus: 403,
  },
  OAUTH_USER_INFO_FAILED: {
    code: 'AUTH_019',
    message: 'Failed to retrieve user information from the external provider.',
    httpStatus: 401,
  },
  OAUTH_NOT_SUPPORTED: {
    code: 'AUTH_020',
    message: 'The requested authentication provider is not supported or configured.',
    httpStatus: 400,
  },
  NATIVE_AUTHORIZATION_INVALID: {
    code: 'AUTH_021',
    message: 'The native authorization request is invalid or has expired.',
    httpStatus: 400,
  },
  NATIVE_REDIRECT_URI_INVALID: {
    code: 'AUTH_022',
    message: 'The native redirect URI is not registered for this client.',
    httpStatus: 400,
  },
  NATIVE_AUDIENCE_INVALID: {
    code: 'AUTH_023',
    message: 'The requested resource audience is not allowed for this native client.',
    httpStatus: 400,
  },
  STEP_UP_UNSUPPORTED: {
    code: 'AUTH_024',
    message: 'The selected authentication provider cannot prove fresh authentication.',
    httpStatus: 400,
  },
  STEP_UP_FAILED: {
    code: 'AUTH_025',
    message: 'Fresh authentication could not be verified.',
    httpStatus: 401,
  },
  ACCOUNT_DISABLED: {
    code: 'AUTH_026',
    message: 'Account unavailable.',
    httpStatus: 401,
  },
};

/**
 * Get the error code mapping for a given AuthErrorCode.
 * Falls back to INTERNAL_ERROR if the error code is not found.
 */
export function getErrorCodeMapping(errorCode: AuthErrorCode): ErrorCodeMapping {
  return ERROR_CODE_MAP[errorCode] ?? ERROR_CODE_MAP.INTERNAL_ERROR;
}
