<!--
  FortressAuth Vue Example
  Demonstrates authentication flows with comprehensive validation and accessibility.
-->
<script setup lang="ts">
import { useAuth, useUser } from '@fortressauth/vue-sdk';
import { computed, ref } from 'vue';
import {
  type FormErrors,
  hasErrors,
  sanitizeInput,
  validateEmail,
  validateResetPasswordForm,
  validateSignInForm,
  validateSignUpForm,
  validateVerifyEmailForm,
} from '../../shared/utils/validation';
import type { AlertType } from './components';
// biome-ignore lint/correctness/noUnusedImports: Components are used in Vue template section
import { Alert, Button, Input, Modal } from './components';

type AuthMode = 'signin' | 'signup' | 'verify' | 'reset';

interface FeedbackState {
  type: AlertType;
  message: string;
}

const { signUp, signIn, signOut, verifyEmail, requestPasswordReset, resetPassword } = useAuth();
// biome-ignore lint/correctness/noUnusedVariables: Variables are used in Vue template section
const { user, loading, error: authError } = useUser();

// Form state
const mode = ref<AuthMode>('signin');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const token = ref('');

// UI state
const isSubmitting = ref(false);
const showResetModal = ref(false);
const feedback = ref<FeedbackState | null>(null);
const errors = ref<FormErrors>({});

// Show feedback message
function showFeedback(type: AlertType, message: string) {
  feedback.value = { type, message };
}

// Clear feedback
function clearFeedback() {
  feedback.value = null;
}

// Clear form state when switching modes
function handleModeChange(newMode: AuthMode) {
  mode.value = newMode;
  errors.value = {};
  clearFeedback();
}

// Reset form
function resetForm() {
  email.value = '';
  password.value = '';
  confirmPassword.value = '';
  token.value = '';
  errors.value = {};
}

// Get user-friendly error message
function getErrorMessage(error?: string): string {
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
}

// Get button text based on mode and state
// biome-ignore lint/correctness/noUnusedVariables: Variable is used in Vue template section
const buttonText = computed(() => {
  if (isSubmitting.value) {
    const loadingTexts: Record<AuthMode, string> = {
      signin: 'Signing in...',
      signup: 'Creating account...',
      verify: 'Verifying...',
      reset: 'Resetting password...',
    };
    return loadingTexts[mode.value];
  }

  const buttonTexts: Record<AuthMode, string> = {
    signin: 'Sign In',
    signup: 'Create Account',
    verify: 'Verify Email',
    reset: 'Reset Password',
  };
  return buttonTexts[mode.value];
});

// Handle form submission
// biome-ignore lint/correctness/noUnusedVariables: Function is used in Vue template section
async function handleSubmit() {
  clearFeedback();

  // Sanitize inputs
  const sanitizedEmail = sanitizeInput(email.value);
  const sanitizedToken = sanitizeInput(token.value);

  // Validate based on mode
  let validationErrors: FormErrors = {};

  switch (mode.value) {
    case 'signin':
      validationErrors = validateSignInForm(sanitizedEmail, password.value);
      break;
    case 'signup':
      validationErrors = validateSignUpForm(sanitizedEmail, password.value, confirmPassword.value);
      break;
    case 'verify':
      validationErrors = validateVerifyEmailForm(sanitizedToken);
      break;
    case 'reset':
      validationErrors = validateResetPasswordForm(
        sanitizedToken,
        password.value,
        confirmPassword.value,
      );
      break;
  }

  errors.value = validationErrors;

  if (hasErrors(validationErrors)) {
    return;
  }

  isSubmitting.value = true;

  try {
    switch (mode.value) {
      case 'signup': {
        const res = await signUp(sanitizedEmail, password.value);
        if (res.success) {
          showFeedback('success', 'Account created! Please check your email for verification.');
          resetForm();
        } else {
          showFeedback('error', getErrorMessage(res.error));
        }
        break;
      }

      case 'signin': {
        const res = await signIn(sanitizedEmail, password.value);
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
          token.value = '';
          handleModeChange('signin');
        } else {
          showFeedback('error', getErrorMessage(res.error));
        }
        break;
      }

      case 'reset': {
        const res = await resetPassword(sanitizedToken, password.value);
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
    isSubmitting.value = false;
  }
}

// Handle password reset request
// biome-ignore lint/correctness/noUnusedVariables: Function is used in Vue template section
async function handleRequestReset() {
  const sanitizedEmail = sanitizeInput(email.value);
  const emailValidation = validateEmail(sanitizedEmail);

  if (!emailValidation.isValid) {
    errors.value = { email: emailValidation.error };
    return;
  }

  isSubmitting.value = true;

  try {
    const res = await requestPasswordReset(sanitizedEmail);
    if (res.success) {
      showFeedback(
        'success',
        'If an account exists with this email, you will receive a password reset link.',
      );
      showResetModal.value = false;
      email.value = '';
    } else {
      showFeedback('error', getErrorMessage(res.error));
    }
  } catch (_err) {
    showFeedback('error', 'An unexpected error occurred. Please try again.');
  } finally {
    isSubmitting.value = false;
  }
}

// Handle sign out
// biome-ignore lint/correctness/noUnusedVariables: Function is used in Vue template section
async function handleSignOut() {
  isSubmitting.value = true;
  try {
    await signOut();
    showFeedback('info', 'You have been signed out.');
  } catch (_err) {
    showFeedback('error', 'Failed to sign out. Please try again.');
  } finally {
    isSubmitting.value = false;
  }
}

// Tab modes for navigation
// biome-ignore lint/correctness/noUnusedVariables: Variable is used in Vue template section
const tabModes: AuthMode[] = ['signin', 'signup', 'verify', 'reset'];

// biome-ignore lint/correctness/noUnusedVariables: Function is used in Vue template section
function getTabLabel(tabMode: AuthMode): string {
  const labels: Record<AuthMode, string> = {
    signin: 'Sign In',
    signup: 'Sign Up',
    verify: 'Verify',
    reset: 'Reset',
  };
  return labels[tabMode];
}
</script>

<template>
  <!-- Skip link for accessibility -->
  <a href="#main-content" class="skip-link">
    Skip to main content
  </a>

  <main id="main-content" class="container" role="main">
    <header class="header">
      <img
        src="/logo.svg"
        alt=""
        class="logo"
        aria-hidden="true"
      />
      <h1 class="title">FortressAuth</h1>
      <p class="subtitle">Secure Authentication Demo</p>
    </header>

    <!-- Loading state -->
    <div v-if="loading" class="loading" role="status" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>Loading session...</span>
    </div>

    <!-- Authenticated state -->
    <section v-else-if="user" class="authenticated" aria-labelledby="welcome-heading">
      <h2 id="welcome-heading" class="sr-only">Welcome</h2>
      
      <div class="user-info">
        <p class="welcome-text">
          Welcome, <span class="user-email">{{ user.email }}</span>
        </p>
        
        <div class="verification-status" role="status">
          <span
            :class="['status-badge', user.emailVerified ? 'status-verified' : 'status-unverified']"
            :aria-label="user.emailVerified ? 'Email verified' : 'Email not verified'"
          >
            {{ user.emailVerified ? '✓ Email Verified' : '⚠ Email Not Verified' }}
          </span>
        </div>
      </div>

      <Button
        variant="secondary"
        :loading="isSubmitting"
        loading-text="Signing out..."
        @click="handleSignOut"
      >
        Sign Out
      </Button>

      <Alert
        v-if="feedback"
        :type="feedback.type"
        :message="feedback.message"
        @dismiss="clearFeedback"
      />
    </section>

    <!-- Unauthenticated state -->
    <section v-else aria-labelledby="auth-heading">
      <h2 id="auth-heading" class="sr-only">Authentication</h2>

      <!-- Tab navigation -->
      <nav class="tabs" role="tablist" aria-label="Authentication options">
        <button
          v-for="tabMode in tabModes"
          :key="tabMode"
          type="button"
          role="tab"
          :class="['tab', { active: mode === tabMode }]"
          :aria-selected="mode === tabMode"
          :aria-controls="`${tabMode}-panel`"
          :id="`${tabMode}-tab`"
          @click="handleModeChange(tabMode)"
        >
          {{ getTabLabel(tabMode) }}
        </button>
      </nav>

      <!-- Form -->
      <form
        novalidate
        role="tabpanel"
        :id="`${mode}-panel`"
        :aria-labelledby="`${mode}-tab`"
        @submit.prevent="handleSubmit"
      >
        <!-- Email field - shown for signin and signup -->
        <Input
          v-if="mode === 'signin' || mode === 'signup'"
          v-model="email"
          type="email"
          label="Email"
          placeholder="your@email.com"
          :error="errors.email"
          required
          :autocomplete="mode === 'signin' ? 'email' : 'email'"
          :disabled="isSubmitting"
        />

        <!-- Token field - shown for verify and reset -->
        <Input
          v-if="mode === 'verify' || mode === 'reset'"
          v-model="token"
          type="text"
          :label="mode === 'verify' ? 'Verification Token' : 'Reset Token'"
          placeholder="selector:verifier"
          :error="errors.token"
          hint="Paste the token from your email"
          required
          autocomplete="off"
          :disabled="isSubmitting"
        />

        <!-- Password field - shown for signin, signup, and reset -->
        <Input
          v-if="mode === 'signin' || mode === 'signup' || mode === 'reset'"
          v-model="password"
          type="password"
          :label="mode === 'reset' ? 'New Password' : 'Password'"
          placeholder="••••••••"
          :error="errors.password"
          :hint="mode === 'signup' || mode === 'reset' ? 'Minimum 8 characters' : undefined"
          required
          :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
          :disabled="isSubmitting"
        />

        <!-- Confirm password field - shown for signup and reset -->
        <Input
          v-if="mode === 'signup' || mode === 'reset'"
          v-model="confirmPassword"
          type="password"
          label="Confirm Password"
          placeholder="••••••••"
          :error="errors.confirmPassword"
          required
          autocomplete="new-password"
          :disabled="isSubmitting"
        />

        <Button
          type="submit"
          variant="primary"
          :loading="isSubmitting"
          :loading-text="buttonText"
        >
          {{ buttonText }}
        </Button>

        <!-- Forgot password link - shown for signin -->
        <div v-if="mode === 'signin'" class="forgot-password">
          <button
            type="button"
            class="link-button"
            @click="showResetModal = true"
          >
            Forgot your password?
          </button>
        </div>
      </form>

      <!-- Feedback messages -->
      <Alert
        v-if="authError"
        type="error"
        :message="getErrorMessage(authError)"
        @dismiss="clearFeedback"
      />

      <Alert
        v-if="feedback"
        :type="feedback.type"
        :message="feedback.message"
        @dismiss="clearFeedback"
      />
    </section>

    <!-- Password reset modal -->
    <Modal
      :is-open="showResetModal"
      title="Reset Password"
      description="Enter your email address and we'll send you a link to reset your password."
      @close="showResetModal = false"
    >
      <Input
        v-model="email"
        type="email"
        label="Email"
        placeholder="your@email.com"
        :error="errors.email"
        required
        autocomplete="email"
        :disabled="isSubmitting"
      />

      <div class="modal-actions">
        <Button
          type="button"
          variant="primary"
          :loading="isSubmitting"
          loading-text="Sending..."
          @click="handleRequestReset"
        >
          Send Reset Link
        </Button>
        <Button
          type="button"
          variant="secondary"
          :disabled="isSubmitting"
          @click="showResetModal = false"
        >
          Cancel
        </Button>
      </div>
    </Modal>
  </main>
</template>
