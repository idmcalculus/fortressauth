// Main class

export type { OAuthProviderId, ProviderId } from './domain/entities/account.js';
// Domain entities
export { Account } from './domain/entities/account.js';
export { EmailVerificationToken } from './domain/entities/email-verification-token.js';
export { LoginAttempt } from './domain/entities/login-attempt.js';
export { OAuthState } from './domain/entities/oauth-state.js';
export { PasswordResetToken } from './domain/entities/password-reset-token.js';
export { Session } from './domain/entities/session.js';
export { User } from './domain/entities/user.js';
export type {
  EmailTemplate,
  EmailTemplateParams,
  EmailTemplateSet,
  EmailTemplateValue,
} from './email-templates.js';
export {
  DEFAULT_EMAIL_TEMPLATES,
  mergeEmailTemplates,
  renderEmailTemplate,
} from './email-templates.js';
export type { AuthResult, ResetPasswordInput, SignInInput, SignUpInput } from './fortress.js';
export { FortressAuth } from './fortress.js';

// Ports
export type { AuthRepository } from './ports/auth-repository.js';
export type { EmailProviderPort } from './ports/email-provider.js';
export type { OAuthProviderPort, OAuthTokens, OAuthUser } from './ports/oauth-provider.js';
export type { RateLimiterPort } from './ports/rate-limiter.js';
export type {
  AuthResponse,
  ErrorResponse,
  LoginRequest,
  RequestPasswordReset,
  ResetPasswordRequest,
  SignupRequest,
  UserResponse,
  VerifyEmailRequest,
} from './schemas/auth.js';
// Schemas
export {
  AuthResponseSchema,
  ErrorResponseSchema,
  LoginRequestSchema,
  RequestPasswordResetSchema,
  ResetPasswordRequestSchema,
  SignupRequestSchema,
  SuccessResponseSchema,
  UserResponseSchema,
  VerifyEmailRequestSchema,
} from './schemas/auth.js';
export type { FortressConfig, FortressConfigInput } from './schemas/config.js';
export { FortressConfigSchema } from './schemas/config.js';

export {
  containsControlCharacters,
  MAX_EMAIL_LENGTH,
  normalizeEmail,
  validateEmailInput,
  validatePasswordInput,
} from './security/input-validation.js';
export { generatePKCE, generateState } from './security/oauth-crypto.js';
// Security utilities
export { hashPassword, verifyPassword } from './security/password.js';
export { MemoryRateLimiter } from './security/rate-limiter.js';
export {
  constantTimeEqual,
  generateSplitToken,
  hashVerifier,
  parseSplitToken,
} from './security/tokens.js';
export type { PasswordConfig } from './security/validation.js';
export { validatePassword } from './security/validation.js';

// Types
export type { AuthErrorCode, ErrorCodeMapping } from './types/errors.js';
export { ERROR_CODE_MAP, getErrorCodeMapping } from './types/errors.js';
export type { Result } from './types/result.js';
export { err, isErr, isOk, ok } from './types/result.js';
