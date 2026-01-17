/**
 * FortressAuth Svelte Example - Validation Re-export
 * Re-exports shared validation utilities for SvelteKit $lib alias compatibility.
 */

export {
  type FormErrors,
  getErrorMessage,
  hasErrors,
  sanitizeInput,
  type ValidationResult,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
  validateResetPasswordForm,
  validateSignInForm,
  validateSignUpForm,
  validateToken,
  validateVerifyEmailForm,
} from '../../../shared/utils/validation.js';
