<script lang="ts">
import { createAuthStore } from '@fortressauth/svelte-sdk';
// biome-ignore lint/correctness/noUnusedImports: Used in Svelte template section
import { base } from '$app/paths';
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

// Use environment variable for API URL, with fallback for development
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const auth = createAuthStore({ baseUrl: apiUrl });
// biome-ignore lint/correctness/noUnusedVariables: Variables are used in Svelte template as $user, $loading, $error
const { user, loading, error } = auth;

type AuthMode = 'signin' | 'signup' | 'verify' | 'reset';
type AlertType = 'success' | 'error' | 'warning' | 'info';

interface FeedbackState {
  type: AlertType;
  message: string;
}

// Form state
let mode: AuthMode = $state('signin');
let email = $state('');
let password = $state('');
let confirmPassword = $state('');
let token = $state('');

// UI state
let isSubmitting = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: Used in Svelte template section
let showResetModal = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: Used in Svelte template section
let feedback: FeedbackState | null = $state(null);
// biome-ignore lint/correctness/noUnusedVariables: Used in Svelte template section
let errors: FormErrors = $state({});

// Alert icons
// biome-ignore lint/correctness/noUnusedVariables: Used in Svelte template section
const alertIcons: Record<AlertType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

function showFeedback(type: AlertType, message: string) {
  feedback = { type, message };
}

function clearFeedback() {
  feedback = null;
}

function handleModeChange(newMode: AuthMode) {
  mode = newMode;
  errors = {};
  clearFeedback();
}

function resetForm() {
  email = '';
  password = '';
  confirmPassword = '';
  token = '';
  errors = {};
}

// biome-ignore lint/correctness/noUnusedVariables: Used in Svelte template section
async function handleSubmit(e: Event) {
  e.preventDefault();
  clearFeedback();

  const sanitizedEmail = sanitizeInput(email);
  const sanitizedToken = sanitizeInput(token);

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

  errors = validationErrors;

  if (hasErrors(validationErrors)) {
    return;
  }

  isSubmitting = true;

  try {
    switch (mode) {
      case 'signup': {
        const res = await auth.signUp(sanitizedEmail, password);
        if (res.success) {
          showFeedback('success', 'Account created! Please check your email for verification.');
          resetForm();
        } else {
          showFeedback('error', getErrorMessage(res.error));
        }
        break;
      }

      case 'signin': {
        const res = await auth.signIn(sanitizedEmail, password);
        if (res.success) {
          showFeedback('success', 'Welcome back!');
          resetForm();
        } else {
          showFeedback('error', getErrorMessage(res.error));
        }
        break;
      }

      case 'verify': {
        const res = await auth.verifyEmail(sanitizedToken);
        if (res.success) {
          showFeedback('success', 'Email verified successfully! You can now sign in.');
          token = '';
          handleModeChange('signin');
        } else {
          showFeedback('error', getErrorMessage(res.error));
        }
        break;
      }

      case 'reset': {
        const res = await auth.resetPassword(sanitizedToken, password);
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
    isSubmitting = false;
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Used in Svelte template section
async function handleRequestReset() {
  const sanitizedEmail = sanitizeInput(email);
  const emailValidation = validateEmail(sanitizedEmail);

  if (!emailValidation.isValid) {
    errors = { email: emailValidation.error };
    return;
  }

  isSubmitting = true;

  try {
    const res = await auth.requestPasswordReset(sanitizedEmail);
    if (res.success) {
      showFeedback(
        'success',
        'If an account exists with this email, you will receive a password reset link.',
      );
      showResetModal = false;
      email = '';
    } else {
      showFeedback('error', getErrorMessage(res.error));
    }
  } catch (_err) {
    showFeedback('error', 'An unexpected error occurred. Please try again.');
  } finally {
    isSubmitting = false;
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Used in Svelte template section
async function handleSignOut() {
  isSubmitting = true;
  try {
    await auth.signOut();
    showFeedback('info', 'You have been signed out.');
  } catch (_err) {
    showFeedback('error', 'Failed to sign out. Please try again.');
  } finally {
    isSubmitting = false;
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Used in Svelte template section
function getButtonText(): string {
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
}

// biome-ignore lint/correctness/noUnusedVariables: Used in Svelte template section
function handleModalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    showResetModal = false;
  }
}

// biome-ignore lint/correctness/noUnusedVariables: Used in Svelte template section
function handleOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    showResetModal = false;
  }
}
</script>

<svelte:head>
  <title>FortressAuth Svelte Demo</title>
  <meta name="description" content="FortressAuth Svelte Demo - Secure authentication example application" />
</svelte:head>

<!-- Skip link for accessibility -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<main id="main-content" class="container">
  <header class="header">
    <img src="{base}/logo.svg" alt="" class="logo" aria-hidden="true" />
    <h1 class="title">FortressAuth</h1>
    <p class="subtitle">Secure Authentication Demo</p>
  </header>

  {#if $loading}
    <div class="loading" role="status" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true"></span>
      <span>Loading session...</span>
    </div>
  {:else if $user}
    <section class="authenticated" aria-labelledby="welcome-heading">
      <h2 id="welcome-heading" class="sr-only">Welcome</h2>

      <div class="user-info">
        <p class="welcome-text">
          Welcome, <span class="user-email">{$user.email}</span>
        </p>

        <div class="verification-status" role="status">
          <span
            class="status-badge {$user.emailVerified ? 'status-verified' : 'status-unverified'}"
            aria-label={$user.emailVerified ? "Email verified" : "Email not verified"}
          >
            {$user.emailVerified ? "✓ Email Verified" : "⚠ Email Not Verified"}
          </span>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-secondary"
        onclick={handleSignOut}
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {#if isSubmitting}
          <span class="btn-spinner" aria-hidden="true"></span>
          <span>Signing out...</span>
        {:else}
          Sign Out
        {/if}
      </button>

      {#if feedback}
        <div class="alert alert-{feedback.type}" role="alert" aria-live="polite">
          <span class="alert-icon" aria-hidden="true">{alertIcons[feedback.type]}</span>
          <span class="alert-message">{feedback.message}</span>
          <button type="button" class="alert-dismiss" onclick={clearFeedback} aria-label="Dismiss alert">×</button>
        </div>
      {/if}
    </section>
  {:else}
    <section aria-labelledby="auth-heading">
      <h2 id="auth-heading" class="sr-only">Authentication</h2>

      <!-- Tab navigation -->
      <div class="tabs" role="tablist" aria-label="Authentication options">
        {#each ["signin", "signup", "verify", "reset"] as tabMode}
          <button
            type="button"
            role="tab"
            class="tab {mode === tabMode ? 'active' : ''}"
            onclick={() => handleModeChange(tabMode as AuthMode)}
            aria-selected={mode === tabMode}
            aria-controls="{tabMode}-panel"
            id="{tabMode}-tab"
          >
            {tabMode === "signin" ? "Sign In" : ""}
            {tabMode === "signup" ? "Sign Up" : ""}
            {tabMode === "verify" ? "Verify" : ""}
            {tabMode === "reset" ? "Reset" : ""}
          </button>
        {/each}
      </div>

      <!-- Form -->
      <form
        onsubmit={handleSubmit}
        novalidate
        id="{mode}-panel"
        aria-labelledby="{mode}-tab"
      >
        <!-- Email field - shown for signin and signup -->
        {#if mode === "signin" || mode === "signup"}
          <div class="form-group">
            <label for="email" class="form-label">
              Email <span class="form-required" aria-hidden="true">*</span>
            </label>
            <input
              type="email"
              id="email"
              class="form-input {errors.email ? 'input-error' : ''}"
              bind:value={email}
              placeholder="your@email.com"
              required
              autocomplete={mode === "signin" ? "email" : "email"}
              disabled={isSubmitting}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {#if errors.email}
              <p id="email-error" class="form-error" role="alert">{errors.email}</p>
            {/if}
          </div>
        {/if}

        <!-- Token field - shown for verify and reset -->
        {#if mode === "verify" || mode === "reset"}
          <div class="form-group">
            <label for="token" class="form-label">
              {mode === "verify" ? "Verification Token" : "Reset Token"}
              <span class="form-required" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              id="token"
              class="form-input {errors.token ? 'input-error' : ''}"
              bind:value={token}
              placeholder="selector:verifier"
              required
              autocomplete="off"
              disabled={isSubmitting}
              aria-invalid={!!errors.token}
              aria-describedby={errors.token ? "token-error" : "token-hint"}
            />
            {#if errors.token}
              <p id="token-error" class="form-error" role="alert">{errors.token}</p>
            {:else}
              <p id="token-hint" class="form-hint">Paste the token from your email</p>
            {/if}
          </div>
        {/if}

        <!-- Password field - shown for signin, signup, and reset -->
        {#if mode === "signin" || mode === "signup" || mode === "reset"}
          <div class="form-group">
            <label for="password" class="form-label">
              {mode === "reset" ? "New Password" : "Password"}
              <span class="form-required" aria-hidden="true">*</span>
            </label>
            <input
              type="password"
              id="password"
              class="form-input {errors.password ? 'input-error' : ''}"
              bind:value={password}
              placeholder="••••••••"
              required
              autocomplete={mode === "signin" ? "current-password" : "new-password"}
              disabled={isSubmitting}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : mode !== "signin" ? "password-hint" : undefined}
            />
            {#if errors.password}
              <p id="password-error" class="form-error" role="alert">{errors.password}</p>
            {:else if mode === "signup" || mode === "reset"}
              <p id="password-hint" class="form-hint">Minimum 8 characters</p>
            {/if}
          </div>
        {/if}

        <!-- Confirm password field - shown for signup and reset -->
        {#if mode === "signup" || mode === "reset"}
          <div class="form-group">
            <label for="confirmPassword" class="form-label">
              Confirm Password <span class="form-required" aria-hidden="true">*</span>
            </label>
            <input
              type="password"
              id="confirmPassword"
              class="form-input {errors.confirmPassword ? 'input-error' : ''}"
              bind:value={confirmPassword}
              placeholder="••••••••"
              required
              autocomplete="new-password"
              disabled={isSubmitting}
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
            />
            {#if errors.confirmPassword}
              <p id="confirmPassword-error" class="form-error" role="alert">{errors.confirmPassword}</p>
            {/if}
          </div>
        {/if}

        <button
          type="submit"
          class="btn btn-primary"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {#if isSubmitting}
            <span class="btn-spinner" aria-hidden="true"></span>
          {/if}
          <span>{getButtonText()}</span>
        </button>

        <!-- Forgot password link - shown for signin -->
        {#if mode === "signin"}
          <div class="forgot-password">
            <button type="button" class="link-button" onclick={() => (showResetModal = true)}>
              Forgot your password?
            </button>
          </div>
        {/if}
      </form>

      <!-- Feedback messages -->
      {#if $error}
        <div class="alert alert-error" role="alert" aria-live="polite">
          <span class="alert-icon" aria-hidden="true">✕</span>
          <span class="alert-message">{getErrorMessage($error)}</span>
          <button type="button" class="alert-dismiss" onclick={clearFeedback} aria-label="Dismiss alert">×</button>
        </div>
      {/if}

      {#if feedback}
        <div class="alert alert-{feedback.type}" role="alert" aria-live="polite">
          <span class="alert-icon" aria-hidden="true">{alertIcons[feedback.type]}</span>
          <span class="alert-message">{feedback.message}</span>
          <button type="button" class="alert-dismiss" onclick={clearFeedback} aria-label="Dismiss alert">×</button>
        </div>
      {/if}
    </section>
  {/if}

  <!-- Password reset modal -->
  {#if showResetModal}
    <div
      class="modal-overlay"
      role="presentation"
      onclick={handleOverlayClick}
      onkeydown={handleModalKeydown}
    >
      <div
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
            onclick={() => (showResetModal = false)}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <p id="modal-description" class="modal-description">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        <div class="form-group">
          <label for="reset-email" class="form-label">
            Email <span class="form-required" aria-hidden="true">*</span>
          </label>
          <input
            type="email"
            id="reset-email"
            class="form-input {errors.email ? 'input-error' : ''}"
            bind:value={email}
            placeholder="your@email.com"
            required
            autocomplete="email"
            disabled={isSubmitting}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "reset-email-error" : undefined}
          />
          {#if errors.email}
            <p id="reset-email-error" class="form-error" role="alert">{errors.email}</p>
          {/if}
        </div>

        <div class="modal-actions">
          <button
            type="button"
            class="btn btn-primary"
            onclick={handleRequestReset}
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {#if isSubmitting}
              <span class="btn-spinner" aria-hidden="true"></span>
              <span>Sending...</span>
            {:else}
              Send Reset Link
            {/if}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            onclick={() => (showResetModal = false)}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  {/if}
</main>
