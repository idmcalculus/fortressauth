/**
 * FortressAuth Angular Example
 * Demonstrates authentication flows with comprehensive validation and accessibility.
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@fortressauth/angular-sdk';
import {
  type FormErrors,
  getErrorMessage,
  hasErrors,
  sanitizeInput,
  validateEmail,
  validateResetPasswordForm,
  validateSignInForm,
  validateSignUpForm,
  validateVerifyEmailForm,
} from '../../../shared/utils/validation';

type AuthMode = 'signin' | 'signup' | 'verify' | 'reset';
type AlertType = 'success' | 'error' | 'warning' | 'info';

interface FeedbackState {
  type: AlertType;
  message: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Skip link for accessibility -->
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <main id="main-content" class="container">
      <header class="header">
        <img
          src="/angular-demo/logo.svg"
          alt=""
          class="logo"
          aria-hidden="true"
        />
        <h1 class="title">FortressAuth</h1>
        <p class="subtitle">Secure Authentication Demo</p>
      </header>

      <!-- Loading State -->
      @if (auth.isLoading) {
        <output class="loading" aria-live="polite">
          <span class="loading-spinner" aria-hidden="true"></span>
          <span>Loading session...</span>
        </output>
      } @else if (auth.currentUser) {
        <!-- Authenticated State -->
        <section class="authenticated" aria-labelledby="welcome-heading">
          <h2 id="welcome-heading" class="sr-only">Welcome</h2>

          <div class="user-info">
            <p class="welcome-text">
              Welcome, <span class="user-email">{{ auth.currentUser.email }}</span>
            </p>

            <output class="verification-status">
              <span
                class="status-badge"
                [class.status-verified]="auth.currentUser.emailVerified"
                [class.status-unverified]="!auth.currentUser.emailVerified"
              >
                {{ auth.currentUser.emailVerified ? '✓ Email Verified' : '⚠ Email Not Verified' }}
              </span>
            </output>
          </div>

          <button
            type="button"
            class="btn btn-secondary"
            (click)="handleSignOut()"
            [disabled]="isSubmitting"
            [attr.aria-busy]="isSubmitting"
          >
            @if (isSubmitting) {
              <span class="btn-spinner" aria-hidden="true"></span>
              <span>Signing out...</span>
            } @else {
              Sign Out
            }
          </button>

          @if (feedback) {
            <div
              class="alert"
              [class.alert-success]="feedback.type === 'success'"
              [class.alert-error]="feedback.type === 'error'"
              [class.alert-warning]="feedback.type === 'warning'"
              [class.alert-info]="feedback.type === 'info'"
              role="alert"
              aria-live="polite"
              aria-atomic="true"
            >
              <span class="alert-icon" aria-hidden="true">{{ getAlertIcon(feedback.type) }}</span>
              <span class="sr-only">{{ getAlertLabel(feedback.type) }}:</span>
              <span class="alert-message">{{ feedback.message }}</span>
              <button
                type="button"
                class="alert-dismiss"
                (click)="clearFeedback()"
                aria-label="Dismiss alert"
              >×</button>
            </div>
          }
        </section>
      } @else {
        <!-- Unauthenticated State -->
        <section aria-labelledby="auth-heading">
          <h2 id="auth-heading" class="sr-only">Authentication</h2>

          <!-- Tab navigation -->
          <div class="tabs" role="tablist" aria-label="Authentication options">
            @for (tabMode of modes; track tabMode) {
              <button
                type="button"
                role="tab"
                class="tab"
                [class.active]="mode === tabMode"
                (click)="handleModeChange(tabMode)"
                [attr.aria-selected]="mode === tabMode"
                [attr.aria-controls]="tabMode + '-panel'"
                [id]="tabMode + '-tab'"
              >
                {{ getTabLabel(tabMode) }}
              </button>
            }
          </div>

          <!-- Form -->
          <form
            (ngSubmit)="handleSubmit()"
            novalidate
            role="tabpanel"
            [id]="mode + '-panel'"
            [attr.aria-labelledby]="mode + '-tab'"
          >
            <!-- Email field - shown for signin and signup -->
            @if (mode === 'signin' || mode === 'signup') {
              <div class="form-group" [class.has-error]="errors.email">
                <label [for]="'email'" class="form-label">
                  Email
                  <span class="form-required" aria-hidden="true"> *</span>
                </label>
                <input
                  type="email"
                  id="email"
                  class="form-input"
                  [class.input-error]="errors.email"
                  [(ngModel)]="email"
                  name="email"
                  placeholder="your@email.com"
                  required
                  [attr.aria-invalid]="!!errors.email"
                  [attr.aria-describedby]="errors.email ? 'email-error' : null"
                  [disabled]="isSubmitting"
                  autocomplete="email"
                />
                @if (errors.email) {
                  <p id="email-error" class="form-error" role="alert">{{ errors.email }}</p>
                }
              </div>
            }

            <!-- Token field - shown for verify and reset -->
            @if (mode === 'verify' || mode === 'reset') {
              <div class="form-group" [class.has-error]="errors.token">
                <label [for]="'token'" class="form-label">
                  {{ mode === 'verify' ? 'Verification Token' : 'Reset Token' }}
                  <span class="form-required" aria-hidden="true"> *</span>
                </label>
                <input
                  type="text"
                  id="token"
                  class="form-input"
                  [class.input-error]="errors.token"
                  [(ngModel)]="token"
                  name="token"
                  placeholder="selector:verifier"
                  required
                  [attr.aria-invalid]="!!errors.token"
                  [attr.aria-describedby]="errors.token ? 'token-error' : 'token-hint'"
                  [disabled]="isSubmitting"
                  autocomplete="off"
                />
                @if (!errors.token) {
                  <p id="token-hint" class="form-hint">Paste the token from your email</p>
                }
                @if (errors.token) {
                  <p id="token-error" class="form-error" role="alert">{{ errors.token }}</p>
                }
              </div>
            }

            <!-- Password field - shown for signin, signup, and reset -->
            @if (mode === 'signin' || mode === 'signup' || mode === 'reset') {
              <div class="form-group" [class.has-error]="errors.password">
                <label [for]="'password'" class="form-label">
                  {{ mode === 'reset' ? 'New Password' : 'Password' }}
                  <span class="form-required" aria-hidden="true"> *</span>
                </label>
                <input
                  type="password"
                  id="password"
                  class="form-input"
                  [class.input-error]="errors.password"
                  [(ngModel)]="password"
                  name="password"
                  placeholder="••••••••"
                  required
                  [attr.aria-invalid]="!!errors.password"
                  [attr.aria-describedby]="errors.password ? 'password-error' : (mode === 'signup' || mode === 'reset' ? 'password-hint' : null)"
                  [disabled]="isSubmitting"
                  [autocomplete]="mode === 'signin' ? 'current-password' : 'new-password'"
                />
                @if ((mode === 'signup' || mode === 'reset') && !errors.password) {
                  <p id="password-hint" class="form-hint">Minimum 8 characters</p>
                }
                @if (errors.password) {
                  <p id="password-error" class="form-error" role="alert">{{ errors.password }}</p>
                }
              </div>
            }

            <!-- Confirm password field - shown for signup and reset -->
            @if (mode === 'signup' || mode === 'reset') {
              <div class="form-group" [class.has-error]="errors.confirmPassword">
                <label [for]="'confirmPassword'" class="form-label">
                  Confirm Password
                  <span class="form-required" aria-hidden="true"> *</span>
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  class="form-input"
                  [class.input-error]="errors.confirmPassword"
                  [(ngModel)]="confirmPassword"
                  name="confirmPassword"
                  placeholder="••••••••"
                  required
                  [attr.aria-invalid]="!!errors.confirmPassword"
                  [attr.aria-describedby]="errors.confirmPassword ? 'confirmPassword-error' : null"
                  [disabled]="isSubmitting"
                  autocomplete="new-password"
                />
                @if (errors.confirmPassword) {
                  <p id="confirmPassword-error" class="form-error" role="alert">{{ errors.confirmPassword }}</p>
                }
              </div>
            }

            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="isSubmitting"
              [attr.aria-busy]="isSubmitting"
            >
              @if (isSubmitting) {
                <span class="btn-spinner" aria-hidden="true"></span>
              }
              <span>{{ getButtonText() }}</span>
            </button>

            <!-- Forgot password link - shown for signin -->
            @if (mode === 'signin') {
              <div class="forgot-password">
                <button
                  type="button"
                  class="link-button"
                  (click)="showResetModal = true"
                >
                  Forgot your password?
                </button>
              </div>
            }
          </form>

          <!-- Feedback messages -->
          @if (auth.currentError) {
            <div
              class="alert alert-error"
              role="alert"
              aria-live="polite"
              aria-atomic="true"
            >
              <span class="alert-icon" aria-hidden="true">✕</span>
              <span class="sr-only">Error:</span>
              <span class="alert-message">{{ getErrorMessage(auth.currentError) }}</span>
              <button
                type="button"
                class="alert-dismiss"
                (click)="clearFeedback()"
                aria-label="Dismiss alert"
              >×</button>
            </div>
          }

          @if (feedback) {
            <div
              class="alert"
              [class.alert-success]="feedback.type === 'success'"
              [class.alert-error]="feedback.type === 'error'"
              [class.alert-warning]="feedback.type === 'warning'"
              [class.alert-info]="feedback.type === 'info'"
              role="alert"
              aria-live="polite"
              aria-atomic="true"
            >
              <span class="alert-icon" aria-hidden="true">{{ getAlertIcon(feedback.type) }}</span>
              <span class="sr-only">{{ getAlertLabel(feedback.type) }}:</span>
              <span class="alert-message">{{ feedback.message }}</span>
              <button
                type="button"
                class="alert-dismiss"
                (click)="clearFeedback()"
                aria-label="Dismiss alert"
              >×</button>
            </div>
          }
        </section>
      }

      <!-- Password reset modal -->
      @if (showResetModal) {
        <div
          class="modal-overlay"
          (click)="handleOverlayClick($event)"
          (keydown)="handleModalKeydown($event)"
          role="presentation"
        >
          <div
            #modalRef
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            aria-describedby="modal-description"
            tabindex="-1"
          >
            <div class="modal-header">
              <h2 id="modal-title" class="modal-title">Reset Password</h2>
              <button
                type="button"
                class="modal-close"
                (click)="showResetModal = false"
                aria-label="Close dialog"
              >×</button>
            </div>

            <p id="modal-description" class="modal-description">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <div class="modal-content">
              <div class="form-group" [class.has-error]="errors.email">
                <label for="resetEmail" class="form-label">
                  Email
                  <span class="form-required" aria-hidden="true"> *</span>
                </label>
                <input
                  type="email"
                  id="resetEmail"
                  class="form-input"
                  [class.input-error]="errors.email"
                  [(ngModel)]="email"
                  name="resetEmail"
                  placeholder="your@email.com"
                  required
                  [attr.aria-invalid]="!!errors.email"
                  [attr.aria-describedby]="errors.email ? 'resetEmail-error' : null"
                  [disabled]="isSubmitting"
                  autocomplete="email"
                />
                @if (errors.email) {
                  <p id="resetEmail-error" class="form-error" role="alert">{{ errors.email }}</p>
                }
              </div>

              <div class="modal-actions">
                <button
                  type="button"
                  class="btn btn-primary"
                  (click)="handleRequestReset()"
                  [disabled]="isSubmitting"
                  [attr.aria-busy]="isSubmitting"
                >
                  @if (isSubmitting) {
                    <span class="btn-spinner" aria-hidden="true"></span>
                    <span>Sending...</span>
                  } @else {
                    Send Reset Link
                  }
                </button>
                <button
                  type="button"
                  class="btn btn-secondary"
                  (click)="showResetModal = false"
                  [disabled]="isSubmitting"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </main>
  `,
})
export class AppComponent implements OnInit {
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  // Available modes for tabs
  modes: AuthMode[] = ['signin', 'signup', 'verify', 'reset'];

  // Form state
  mode: AuthMode = 'signin';
  email = '';
  password = '';
  confirmPassword = '';
  token = '';

  // UI state
  isSubmitting = false;
  showResetModal = false;
  feedback: FeedbackState | null = null;
  errors: FormErrors = {};

  // Re-export for template use
  getErrorMessage = getErrorMessage;

  ngOnInit(): void {
    // Subscribe to auth state changes to trigger change detection
    this.auth.state$.subscribe(() => {
      this.cdr.detectChanges();
    });
  }

  // Clear feedback
  clearFeedback(): void {
    this.feedback = null;
  }

  // Show feedback message
  showFeedback(type: AlertType, message: string): void {
    this.feedback = { type, message };
  }

  // Handle mode change
  handleModeChange(newMode: AuthMode): void {
    this.mode = newMode;
    this.errors = {};
    this.clearFeedback();
  }

  // Reset form
  resetForm(): void {
    this.email = '';
    this.password = '';
    this.confirmPassword = '';
    this.token = '';
    this.errors = {};
  }

  // Get tab label
  getTabLabel(tabMode: AuthMode): string {
    const labels: Record<AuthMode, string> = {
      signin: 'Sign In',
      signup: 'Sign Up',
      verify: 'Verify',
      reset: 'Reset',
    };
    return labels[tabMode];
  }

  // Get button text based on mode and state
  getButtonText(): string {
    if (this.isSubmitting) {
      const loadingTexts: Record<AuthMode, string> = {
        signin: 'Signing in...',
        signup: 'Creating account...',
        verify: 'Verifying...',
        reset: 'Resetting password...',
      };
      return loadingTexts[this.mode];
    }

    const buttonTexts: Record<AuthMode, string> = {
      signin: 'Sign In',
      signup: 'Create Account',
      verify: 'Verify Email',
      reset: 'Reset Password',
    };
    return buttonTexts[this.mode];
  }

  // Get alert icon
  getAlertIcon(type: AlertType): string {
    const icons: Record<AlertType, string> = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };
    return icons[type];
  }

  // Get alert label for screen readers
  getAlertLabel(type: AlertType): string {
    const labels: Record<AlertType, string> = {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Information',
    };
    return labels[type];
  }

  // Handle form submission
  async handleSubmit(): Promise<void> {
    this.clearFeedback();

    // Sanitize inputs
    const sanitizedEmail = sanitizeInput(this.email);
    const sanitizedToken = sanitizeInput(this.token);

    // Validate based on mode
    let validationErrors: FormErrors = {};

    switch (this.mode) {
      case 'signin':
        validationErrors = validateSignInForm(sanitizedEmail, this.password);
        break;
      case 'signup':
        validationErrors = validateSignUpForm(sanitizedEmail, this.password, this.confirmPassword);
        break;
      case 'verify':
        validationErrors = validateVerifyEmailForm(sanitizedToken);
        break;
      case 'reset':
        validationErrors = validateResetPasswordForm(
          sanitizedToken,
          this.password,
          this.confirmPassword,
        );
        break;
    }

    this.errors = validationErrors;

    if (hasErrors(validationErrors)) {
      return;
    }

    this.isSubmitting = true;

    try {
      switch (this.mode) {
        case 'signup': {
          const res = await this.auth.signUp(sanitizedEmail, this.password);
          if (res.success) {
            this.showFeedback(
              'success',
              'Account created! Please check your email for verification.',
            );
            this.resetForm();
          } else {
            this.showFeedback('error', getErrorMessage(res.error));
          }
          break;
        }

        case 'signin': {
          const res = await this.auth.signIn(sanitizedEmail, this.password);
          if (res.success) {
            this.showFeedback('success', 'Welcome back!');
            this.resetForm();
          } else {
            this.showFeedback('error', getErrorMessage(res.error));
          }
          break;
        }

        case 'verify': {
          const res = await this.auth.verifyEmail(sanitizedToken);
          if (res.success) {
            this.showFeedback('success', 'Email verified successfully! You can now sign in.');
            this.token = '';
            this.handleModeChange('signin');
          } else {
            this.showFeedback('error', getErrorMessage(res.error));
          }
          break;
        }

        case 'reset': {
          const res = await this.auth.resetPassword(sanitizedToken, this.password);
          if (res.success) {
            this.showFeedback(
              'success',
              'Password reset successful! Please sign in with your new password.',
            );
            this.resetForm();
            this.handleModeChange('signin');
          } else {
            this.showFeedback('error', getErrorMessage(res.error));
          }
          break;
        }
      }
    } catch {
      this.showFeedback('error', 'An unexpected error occurred. Please try again.');
    } finally {
      this.isSubmitting = false;
    }
  }

  // Handle password reset request
  async handleRequestReset(): Promise<void> {
    const sanitizedEmail = sanitizeInput(this.email);
    const emailValidation = validateEmail(sanitizedEmail);

    if (!emailValidation.isValid) {
      this.errors = { email: emailValidation.error };
      return;
    }

    this.isSubmitting = true;

    try {
      const res = await this.auth.requestPasswordReset(sanitizedEmail);
      if (res.success) {
        this.showFeedback(
          'success',
          'If an account exists with this email, you will receive a password reset link.',
        );
        this.showResetModal = false;
        this.email = '';
      } else {
        this.showFeedback('error', getErrorMessage(res.error));
      }
    } catch {
      this.showFeedback('error', 'An unexpected error occurred. Please try again.');
    } finally {
      this.isSubmitting = false;
    }
  }

  // Handle sign out
  async handleSignOut(): Promise<void> {
    this.isSubmitting = true;
    try {
      await this.auth.signOut();
      this.showFeedback('info', 'You have been signed out.');
    } catch {
      this.showFeedback('error', 'Failed to sign out. Please try again.');
    } finally {
      this.isSubmitting = false;
    }
  }

  // Handle overlay click to close modal
  handleOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.showResetModal = false;
    }
  }

  // Handle modal keyboard events
  handleModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.showResetModal = false;
    }
  }
}
