/**
 * FortressAuth Design System - Form Validation Utilities
 * Shared validation utilities for all example applications.
 * 
 * This is the compiled JavaScript version for use with Electron and other
 * environments that don't support TypeScript directly.
 * 
 * Usage: const validation = require('../../shared/utils/validation.cjs');
 */

"use strict";

/**
 * Validates email format according to RFC 5322 (simplified)
 * @param {string} email
 * @returns {{ isValid: boolean, error?: string }}
 */
function validateEmail(email) {
  if (!email || email.trim() === '') {
    return { isValid: false, error: 'Email is required' };
  }

  const trimmedEmail = email.trim();

  // Check for null bytes or control characters
  if (/[\x00-\x1f\x7f]/.test(trimmedEmail)) {
    return { isValid: false, error: 'Email contains invalid characters' };
  }

  // Check maximum length
  if (trimmedEmail.length > 254) {
    return { isValid: false, error: 'Email is too long (max 254 characters)' };
  }

  // RFC 5322 simplified email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmedEmail)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }

  return { isValid: true };
}

/**
 * Validates password strength
 * @param {string} password
 * @param {number} [minLength=8]
 * @param {number} [maxLength=128]
 * @returns {{ isValid: boolean, error?: string }}
 */
function validatePassword(password, minLength = 8, maxLength = 128) {
  if (!password) {
    return { isValid: false, error: 'Password is required' };
  }

  // Check for null bytes or control characters
  if (/[\x00-\x1f\x7f]/.test(password)) {
    return { isValid: false, error: 'Password contains invalid characters' };
  }

  if (password.length < minLength) {
    return { isValid: false, error: `Password must be at least ${minLength} characters` };
  }

  if (password.length > maxLength) {
    return { isValid: false, error: `Password must be at most ${maxLength} characters` };
  }

  return { isValid: true };
}

/**
 * Validates password confirmation matches
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {{ isValid: boolean, error?: string }}
 */
function validatePasswordConfirmation(password, confirmPassword) {
  if (!confirmPassword) {
    return { isValid: false, error: 'Please confirm your password' };
  }

  if (password !== confirmPassword) {
    return { isValid: false, error: 'Passwords do not match' };
  }

  return { isValid: true };
}

/**
 * Validates token format (selector:verifier)
 * @param {string} token
 * @returns {{ isValid: boolean, error?: string }}
 */
function validateToken(token) {
  if (!token || token.trim() === '') {
    return { isValid: false, error: 'Token is required' };
  }

  const trimmedToken = token.trim();

  // Check for null bytes or control characters
  if (/[\x00-\x1f\x7f]/.test(trimmedToken)) {
    return { isValid: false, error: 'Token contains invalid characters' };
  }

  // Token should be in selector:verifier format
  const parts = trimmedToken.split(':');
  if (parts.length !== 2) {
    return { isValid: false, error: 'Invalid token format. Expected selector:verifier' };
  }

  const selector = parts[0] || '';
  const verifier = parts[1] || '';

  // Selector should be 32 hex characters (16 bytes)
  if (!/^[0-9a-fA-F]{32}$/.test(selector)) {
    return { isValid: false, error: 'Invalid token format' };
  }

  // Verifier should be 64 hex characters (32 bytes)
  if (!/^[0-9a-fA-F]{64}$/.test(verifier)) {
    return { isValid: false, error: 'Invalid token format' };
  }

  return { isValid: true };
}

/**
 * Sanitizes input by trimming and removing dangerous characters
 * @param {string} input
 * @returns {string}
 */
function sanitizeInput(input) {
  if (!input) return '';
  
  // Remove null bytes and control characters
  return input.replace(/[\x00-\x1f\x7f]/g, '').trim();
}

/**
 * Validates sign-in form
 * @param {string} email
 * @param {string} password
 * @returns {{ email?: string, password?: string }}
 */
function validateSignInForm(email, password) {
  const errors = {};

  const emailResult = validateEmail(email);
  if (!emailResult.isValid) {
    errors.email = emailResult.error;
  }

  const passwordResult = validatePassword(password);
  if (!passwordResult.isValid) {
    errors.password = passwordResult.error;
  }

  return errors;
}

/**
 * Validates sign-up form
 * @param {string} email
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {{ email?: string, password?: string, confirmPassword?: string }}
 */
function validateSignUpForm(email, password, confirmPassword) {
  const errors = {};

  const emailResult = validateEmail(email);
  if (!emailResult.isValid) {
    errors.email = emailResult.error;
  }

  const passwordResult = validatePassword(password);
  if (!passwordResult.isValid) {
    errors.password = passwordResult.error;
  }

  const confirmResult = validatePasswordConfirmation(password, confirmPassword);
  if (!confirmResult.isValid) {
    errors.confirmPassword = confirmResult.error;
  }

  return errors;
}

/**
 * Validates password reset form
 * @param {string} token
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {{ token?: string, password?: string, confirmPassword?: string }}
 */
function validateResetPasswordForm(token, password, confirmPassword) {
  const errors = {};

  const tokenResult = validateToken(token);
  if (!tokenResult.isValid) {
    errors.token = tokenResult.error;
  }

  const passwordResult = validatePassword(password);
  if (!passwordResult.isValid) {
    errors.password = passwordResult.error;
  }

  const confirmResult = validatePasswordConfirmation(password, confirmPassword);
  if (!confirmResult.isValid) {
    errors.confirmPassword = confirmResult.error;
  }

  return errors;
}

/**
 * Validates email verification form
 * @param {string} token
 * @returns {{ token?: string }}
 */
function validateVerifyEmailForm(token) {
  const errors = {};

  const tokenResult = validateToken(token);
  if (!tokenResult.isValid) {
    errors.token = tokenResult.error;
  }

  return errors;
}

/**
 * Checks if form has any errors
 * @param {{ [key: string]: string | undefined }} errors
 * @returns {boolean}
 */
function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

/**
 * Get user-friendly error message from error code
 * @param {string} [error]
 * @returns {string}
 */
function getErrorMessage(error) {
  const errorMessages = {
    EMAIL_EXISTS: 'An account with this email already exists.',
    INVALID_CREDENTIALS: 'Invalid email or password. Please try again.',
    PASSWORD_TOO_WEAK: 'Password does not meet the requirements.',
    ACCOUNT_LOCKED: 'Your account has been temporarily locked. Please try again later.',
    EMAIL_NOT_VERIFIED: 'Please verify your email before signing in.',
    SESSION_INVALID: 'Your session is invalid. Please sign in again.',
    SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
    EMAIL_VERIFICATION_INVALID: 'Invalid verification token.',
    EMAIL_VERIFICATION_EXPIRED: 'Verification token has expired. Please request a new one.',
    PASSWORD_RESET_INVALID: 'Invalid password reset token.',
    PASSWORD_RESET_EXPIRED: 'Password reset token has expired. Please request a new one.',
    RATE_LIMIT_EXCEEDED: 'Too many attempts. Please wait a moment and try again.',
  };

  return errorMessages[error || ''] || 'An error occurred. Please try again.';
}

// Export all functions
module.exports = {
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
  validateToken,
  sanitizeInput,
  validateSignInForm,
  validateSignUpForm,
  validateResetPasswordForm,
  validateVerifyEmailForm,
  hasErrors,
  getErrorMessage,
};
