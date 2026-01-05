/**
 * FortressAuth Mobile Example - Main Screen
 *
 * This code works identically with both SDKs:
 *   - @fortressauth/expo-sdk (uses SecureStore - encrypted)
 *   - @fortressauth/react-native-sdk (uses AsyncStorage)
 *
 * Just change the import to switch between them!
 */

// For React Native CLI, change to: '@fortressauth/react-native-sdk'
import { useAuth, useUser } from '@fortressauth/expo-sdk';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert as RNAlert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
} from '../../shared/utils/validation';
import { Alert, type AlertType, Button, Input, Logo, Modal } from '../components';
import { borderRadius, colors, spacing, typography } from '../styles/designTokens';

type AuthMode = 'signin' | 'signup' | 'verify' | 'reset';

interface FeedbackState {
  type: AlertType;
  message: string;
}

export default function HomeScreen() {
  const { signIn, signUp, signOut, verifyEmail, requestPasswordReset, resetPassword } = useAuth();
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

  // Show feedback
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
  const handleSubmit = async () => {
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
        RNAlert.alert(
          'Success',
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

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary[400]} />
          <Text style={styles.loadingText}>Loading session...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Logo width={64} height={64} />
            <Text style={styles.title}>FortressAuth</Text>
            <Text style={styles.subtitle}>Secure Authentication Demo</Text>
          </View>

          {user ? (
            // Authenticated state
            <View style={styles.authenticated}>
              <View style={styles.userInfo}>
                <Text style={styles.welcomeText}>
                  Welcome, <Text style={styles.userEmail}>{user.email}</Text>
                </Text>

                <View
                  style={[
                    styles.statusBadge,
                    user.emailVerified ? styles.statusVerified : styles.statusUnverified,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: user.emailVerified ? colors.success : colors.warning },
                    ]}
                  >
                    {user.emailVerified ? '✓ Email Verified' : '⚠ Email Not Verified'}
                  </Text>
                </View>
              </View>

              <Button
                variant="secondary"
                onPress={handleSignOut}
                loading={isSubmitting}
                loadingText="Signing out..."
              >
                Sign Out
              </Button>

              {feedback && (
                <Alert type={feedback.type} message={feedback.message} onDismiss={clearFeedback} />
              )}
            </View>
          ) : (
            // Unauthenticated state
            <>
              {/* Tab navigation */}
              <View style={styles.tabs} accessibilityRole="tablist">
                {(['signin', 'signup', 'verify', 'reset'] as AuthMode[]).map((tabMode) => (
                  <TouchableOpacity
                    key={tabMode}
                    style={[styles.tab, mode === tabMode && styles.tabActive]}
                    onPress={() => handleModeChange(tabMode)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === tabMode }}
                  >
                    <Text style={[styles.tabText, mode === tabMode && styles.tabTextActive]}>
                      {tabMode === 'signin' && 'Sign In'}
                      {tabMode === 'signup' && 'Sign Up'}
                      {tabMode === 'verify' && 'Verify'}
                      {tabMode === 'reset' && 'Reset'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Form */}
              <View style={styles.form}>
                {/* Email field - shown for signin and signup */}
                {(mode === 'signin' || mode === 'signup') && (
                  <Input
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your@email.com"
                    error={errors.email}
                    required
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    editable={!isSubmitting}
                  />
                )}

                {/* Token field - shown for verify and reset */}
                {(mode === 'verify' || mode === 'reset') && (
                  <Input
                    label={mode === 'verify' ? 'Verification Token' : 'Reset Token'}
                    value={token}
                    onChangeText={setToken}
                    placeholder="selector:verifier"
                    error={errors.token}
                    hint="Paste the token from your email"
                    required
                    autoCapitalize="none"
                    autoComplete="off"
                    editable={!isSubmitting}
                  />
                )}

                {/* Password field - shown for signin, signup, and reset */}
                {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
                  <Input
                    label={mode === 'reset' ? 'New Password' : 'Password'}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    error={errors.password}
                    hint={
                      mode === 'signup' || mode === 'reset' ? 'Minimum 8 characters' : undefined
                    }
                    required
                    secureTextEntry
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    editable={!isSubmitting}
                  />
                )}

                {/* Confirm password field - shown for signup and reset */}
                {(mode === 'signup' || mode === 'reset') && (
                  <Input
                    label="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="••••••••"
                    error={errors.confirmPassword}
                    required
                    secureTextEntry
                    autoComplete="new-password"
                    editable={!isSubmitting}
                  />
                )}

                <Button
                  variant="primary"
                  onPress={handleSubmit}
                  loading={isSubmitting}
                  loadingText={getButtonText()}
                >
                  {getButtonText()}
                </Button>

                {/* Forgot password link - shown for signin */}
                {mode === 'signin' && (
                  <TouchableOpacity
                    style={styles.forgotPassword}
                    onPress={() => setShowResetModal(true)}
                  >
                    <Text style={styles.forgotPasswordText}>Forgot your password?</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Feedback messages */}
              {authError && (
                <Alert
                  type="error"
                  message={getErrorMessage(authError)}
                  onDismiss={clearFeedback}
                />
              )}

              {feedback && (
                <Alert type={feedback.type} message={feedback.message} onDismiss={clearFeedback} />
              )}
            </>
          )}
        </View>

        {/* Password reset modal */}
        <Modal
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
          title="Reset Password"
          description="Enter your email address and we'll send you a link to reset your password."
        >
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            error={errors.email}
            required
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!isSubmitting}
          />

          <View style={styles.modalActions}>
            <Button
              variant="primary"
              onPress={handleRequestReset}
              loading={isSubmitting}
              loadingText="Sending..."
            >
              Send Reset Link
            </Button>
            <Button
              variant="secondary"
              onPress={() => setShowResetModal(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing[4],
  },
  card: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border.secondary,
    padding: spacing[10],
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing[8],
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginTop: spacing[4],
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing[2],
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[4],
  },
  loadingText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: spacing[6],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.secondary,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  tabActive: {
    borderBottomColor: colors.text.accent,
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
  },
  tabTextActive: {
    color: colors.text.accent,
  },
  form: {
    width: '100%',
  },
  forgotPassword: {
    marginTop: spacing[4],
    alignItems: 'center',
    padding: spacing[1],
  },
  forgotPasswordText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  authenticated: {
    alignItems: 'center',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: spacing[6],
  },
  welcomeText: {
    fontSize: typography.fontSize.lg,
    color: colors.text.primary,
    marginBottom: spacing[4],
  },
  userEmail: {
    color: colors.text.accent,
    fontWeight: typography.fontWeight.medium,
  },
  statusBadge: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  statusVerified: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
  },
  statusUnverified: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warning,
  },
  statusText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  modalActions: {
    marginTop: spacing[4],
    gap: spacing[3],
  },
});
