/**
 * FortressAuth - Input Component for React Native
 * Accessible form input with validation states and error messages.
 */

import type React from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { borderRadius, colors, spacing, typography } from '../styles/designTokens';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  required,
  editable = true,
  ...props
}) => {
  const hasError = Boolean(error);
  const isDisabled = editable === false;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>

      <TextInput
        style={[styles.input, hasError && styles.inputError, isDisabled && styles.inputDisabled]}
        placeholderTextColor={colors.text.muted}
        editable={editable}
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{
          disabled: isDisabled,
        }}
        {...props}
      />

      {hint && !hasError && <Text style={styles.hint}>{hint}</Text>}

      {hasError && (
        <Text style={styles.error} accessibilityRole="alert">
          ⚠ {error}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[4],
  },
  label: {
    marginBottom: spacing[2],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
  },
  required: {
    color: colors.error,
  },
  input: {
    width: '100%',
    padding: spacing[3],
    paddingHorizontal: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg.input,
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
  },
  inputError: {
    borderColor: colors.border.error,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  hint: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
  },
  error: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.sm,
    color: colors.error,
  },
});

export default Input;
