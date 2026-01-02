/**
 * FortressAuth - Button Component for React Native
 * Accessible button with loading states and variants.
 */

import type React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type TouchableOpacityProps,
  View,
} from 'react-native';
import { borderRadius, colors, shadows, spacing, typography } from '../styles/designTokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  loading = false,
  loadingText,
  children,
  disabled,
  ...props
}) => {
  const isDisabled = disabled || loading;

  const getButtonStyle = () => {
    switch (variant) {
      case 'secondary':
        return styles.buttonSecondary;
      case 'ghost':
        return styles.buttonGhost;
      default:
        return styles.buttonPrimary;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'secondary':
        return styles.textSecondary;
      case 'ghost':
        return styles.textGhost;
      default:
        return styles.textPrimary;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, getButtonStyle(), isDisabled && styles.buttonDisabled]}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{
        disabled: isDisabled,
        busy: loading,
      }}
      {...props}
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? 'white' : colors.text.primary}
          />
          <Text style={[styles.text, getTextStyle()]}>{loadingText || 'Loading...'}</Text>
        </View>
      ) : (
        <Text style={[styles.text, getTextStyle()]}>{children}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
  },
  buttonPrimary: {
    backgroundColor: colors.primary[400],
    ...shadows.glow,
  },
  buttonSecondary: {
    backgroundColor: colors.bg.tertiary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    marginTop: spacing[2],
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  text: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
  },
  textPrimary: {
    color: 'white',
  },
  textSecondary: {
    color: colors.text.primary,
  },
  textGhost: {
    color: colors.text.secondary,
  },
});

export default Button;
