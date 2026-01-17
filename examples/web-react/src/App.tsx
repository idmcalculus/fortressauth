/**
 * FortressAuth React Example
 * Demonstrates authentication flows with comprehensive validation and accessibility.
 */

import { useAuth, useUser } from '@fortressauth/react-sdk';
import { useCallback, useState } from 'react';
import {
  type FormErrors,
  hasErrors,
  sanitizeInput,
  validateEmail,
  validateResetPasswordForm,
  validateSignInForm,
  validateSignUpForm,
  validateVerifyEmailForm,
} from '../../shared/utils/validation.js';
import type { AlertType } from './components/index.js';
import { Alert, Button, Input, Modal } from './components/index.js';
import './App.css';

type AuthMode = 'signin' | 'signup' | 'verify' | 'reset';

interface FeedbackState {
  type: AlertType;
  message: string;
}

export default function App() {
  const { signUp, signIn, signOut, verifyEmail, requestPasswordReset, resetPassword } = useAuth();
  const { user, loading, error: authError } = useUser();

  // Form state
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  // Clear feedback after delay
  const showFeedback = useCallback((type: AlertType, message: string) => {
    setFeedback({ type, message });
  }, []);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  // Clear form state when switching modes
  const handleModeChange = useCallback(
    (newMode: AuthMode) => {
      setMode(newMode);
      setErrors({});
      clearFeedback();
    },
    [clearFeedback],
  );

  // Reset form
  const resetForm = useCallback(() => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setToken('');
    setErrors({});
  }, []);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    // Sanitize inputs
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedToken = sanitizeInput(token);

    // Validate based on mode
    let validationErrors: FormErrors = {};

    switch (mode) {
      case 'signin':
        validationErrors = validateSignInForm(sanitizedEmail, password);
        break;
      case 'signup':
        validationErrors = validateSignUpForm(sanitizedEmail, password, confirmPassword);
        break;
      case 'verify':
        validationErrors = validateVerifyEmailForm(sanitizedToken);
        break;
      case 'reset':
        validationErrors = validateResetPasswordForm(sanitizedToken, password, confirmPassword);
        break;
    }

    setErrors(validationErrors);

    if (hasErrors(validationErrors)) {
      return;
    }

    setIsSubmitting(true);

    try {
      switch (mode) {
        case 'signup': {
          const res = await signUp(sanitizedEmail, password);
          if (res.success) {
            showFeedback('success', 'Account created! Please check your email for verification.');
            resetForm();
          } else {
            showFeedback('error', getErrorMessage(res.error));
          }
          break;
        }

        case 'signin': {
          const res = await signIn(sanitizedEmail, password);
          if (res.success) {
            showFeedback('success', 'Welcome back!');
            resetForm();
          } else {
            showFeedback('error', getErrorMessage(res.error));
          }
          break;
        }

        case 'verify': {
          const res = await verifyEmail(sanitizedToken);
          if (res.success) {
            showFeedback('success', 'Email verified successfully! You can now sign in.');
            setToken('');
            handleModeChange('signin');
          } else {
            showFeedback('error', getErrorMessage(res.error));
          }
          break;
        }

        case 'reset': {
          const res = await resetPassword(sanitizedToken, password);
          if (res.success) {
            showFeedback(
              'success',
              'Password reset successful! Please sign in with your new password.',
            );
            resetForm();
            handleModeChange('signin');
          } else {
            showFeedback('error', getErrorMessage(res.error));
          }
          break;
        }
      }
    } catch (_err) {
      showFeedback('error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle password reset request
  const handleRequestReset = async () => {
    const sanitizedEmail = sanitizeInput(email);
    const emailValidation = validateEmail(sanitizedEmail);

    if (!emailValidation.isValid) {
      setErrors({ email: emailValidation.error });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await requestPasswordReset(sanitizedEmail);
      if (res.success) {
        showFeedback(
          'success',
          'If an account exists with this email, you will receive a password reset link.',
        );
        setShowResetModal(false);
        setEmail('');
      } else {
        showFeedback('error', getErrorMessage(res.error));
      }
    } catch (_err) {
      showFeedback('error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle sign out
  const handleSignOut = async () => {
    setIsSubmitting(true);
    try {
      await signOut();
      showFeedback('info', 'You have been signed out.');
    } catch (_err) {
      showFeedback('error', 'Failed to sign out. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get user-friendly error message
  const getErrorMessage = (error?: string): string => {
    const errorMessages: Record<string, string> = {
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
  };

  // Get button text based on mode and state
  const getButtonText = (): string => {
    if (isSubmitting) {
      const loadingTexts: Record<AuthMode, string> = {
        signin: 'Signing in...',
        signup: 'Creating account...',
        verify: 'Verifying...',
        reset: 'Resetting password...',
      };
      return loadingTexts[mode];
    }

    const buttonTexts: Record<AuthMode, string> = {
      signin: 'Sign In',
      signup: 'Create Account',
      verify: 'Verify Email',
      reset: 'Reset Password',
    };
    return buttonTexts[mode];
  };

  return (
    <>
      {/* Skip link for accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <main id="main-content" className="container">
        <header className="header">
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt=""
            className="logo"
            aria-hidden="true"
          />
          <h1 className="title">FortressAuth</h1>
          <p className="subtitle">Secure Authentication Demo</p>
        </header>

        {loading ? (
          <output className="loading" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <span>Loading session...</span>
          </output>
        ) : user ? (
          <section className="authenticated" aria-labelledby="welcome-heading">
            <h2 id="welcome-heading" className="sr-only">
              Welcome
            </h2>

            <div className="user-info">
              <p className="welcome-text">
                Welcome, <span className="user-email">{user.email}</span>
              </p>

              <output className="verification-status">
                <span
                  className={`status-badge ${user.emailVerified ? 'status-verified' : 'status-unverified'}`}
                >
                  {user.emailVerified ? '✓ Email Verified' : '⚠ Email Not Verified'}
                </span>
              </output>
            </div>

            <Button
              variant="secondary"
              onClick={handleSignOut}
              loading={isSubmitting}
              loadingText="Signing out..."
            >
              Sign Out
            </Button>

            {feedback && (
              <Alert type={feedback.type} message={feedback.message} onDismiss={clearFeedback} />
            )}
          </section>
        ) : (
          <section aria-labelledby="auth-heading">
            <h2 id="auth-heading" className="sr-only">
              Authentication
            </h2>

            {/* Tab navigation */}
            <div className="tabs" role="tablist" aria-label="Authentication options">
              {(['signin', 'signup', 'verify', 'reset'] as AuthMode[]).map((tabMode) => (
                <button
                  key={tabMode}
                  type="button"
                  role="tab"
                  className={`tab ${mode === tabMode ? 'active' : ''}`}
                  onClick={() => handleModeChange(tabMode)}
                  aria-selected={mode === tabMode}
                  aria-controls={`${tabMode}-panel`}
                  id={`${tabMode}-tab`}
                >
                  {tabMode === 'signin' && 'Sign In'}
                  {tabMode === 'signup' && 'Sign Up'}
                  {tabMode === 'verify' && 'Verify'}
                  {tabMode === 'reset' && 'Reset'}
                </button>
              ))}
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              noValidate
              role="tabpanel"
              id={`${mode}-panel`}
              aria-labelledby={`${mode}-tab`}
            >
              {/* Email field - shown for signin and signup */}
              {(mode === 'signin' || mode === 'signup') && (
                <Input
                  type="email"
                  label="Email"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  error={errors.email}
                  required
                  autoComplete={mode === 'signin' ? 'email' : 'email'}
                  disabled={isSubmitting}
                />
              )}

              {/* Token field - shown for verify and reset */}
              {(mode === 'verify' || mode === 'reset') && (
                <Input
                  type="text"
                  label={mode === 'verify' ? 'Verification Token' : 'Reset Token'}
                  value={token}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
                  placeholder="selector:verifier"
                  error={errors.token}
                  hint="Paste the token from your email"
                  required
                  autoComplete="off"
                  disabled={isSubmitting}
                />
              )}

              {/* Password field - shown for signin, signup, and reset */}
              {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
                <Input
                  type="password"
                  label={mode === 'reset' ? 'New Password' : 'Password'}
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  error={errors.password}
                  hint={mode === 'signup' || mode === 'reset' ? 'Minimum 8 characters' : undefined}
                  required
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  disabled={isSubmitting}
                />
              )}

              {/* Confirm password field - shown for signup and reset */}
              {(mode === 'signup' || mode === 'reset') && (
                <Input
                  type="password"
                  label="Confirm Password"
                  value={confirmPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setConfirmPassword(e.target.value)
                  }
                  placeholder="••••••••"
                  error={errors.confirmPassword}
                  required
                  autoComplete="new-password"
                  disabled={isSubmitting}
                />
              )}

              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting}
                loadingText={getButtonText()}
              >
                {getButtonText()}
              </Button>

              {/* Forgot password link - shown for signin */}
              {mode === 'signin' && (
                <div className="forgot-password">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setShowResetModal(true)}
                  >
                    Forgot your password?
                  </button>
                </div>
              )}
            </form>

            {/* Feedback messages */}
            {authError && (
              <Alert type="error" message={getErrorMessage(authError)} onDismiss={clearFeedback} />
            )}

            {feedback && (
              <Alert type={feedback.type} message={feedback.message} onDismiss={clearFeedback} />
            )}
          </section>
        )}

        {/* Password reset modal */}
        <Modal
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
          title="Reset Password"
          description="Enter your email address and we'll send you a link to reset your password."
        >
          <Input
            type="email"
            label="Email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            placeholder="your@email.com"
            error={errors.email}
            required
            autoComplete="email"
            disabled={isSubmitting}
          />

          <div className="modal-actions">
            <Button
              type="button"
              variant="primary"
              onClick={handleRequestReset}
              loading={isSubmitting}
              loadingText="Sending..."
            >
              Send Reset Link
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowResetModal(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </Modal>
      </main>
    </>
  );
}
