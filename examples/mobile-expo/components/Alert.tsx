/**
 * FortressAuth - Alert Component for React Native
 * Displays feedback messages to users with appropriate styling.
 */

import type React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, colors, spacing, typography } from '../styles/designTokens';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps {
  type: AlertType;
  message: string;
  onDismiss?: () => void;
  dismissible?: boolean;
}

const alertConfig: Record<AlertType, { icon: string; color: string; bgColor: string }> = {
  success: { icon: '✓', color: colors.success, bgColor: colors.successBg },
  error: { icon: '✕', color: colors.error, bgColor: colors.errorBg },
  warning: { icon: '⚠', color: colors.warning, bgColor: colors.warningBg },
  info: { icon: 'ℹ', color: colors.info, bgColor: colors.infoBg },
};

export const Alert: React.FC<AlertProps> = ({ type, message, onDismiss, dismissible = true }) => {
  const config = alertConfig[type];

  return (
    <View
      style={[styles.container, { backgroundColor: config.bgColor, borderColor: config.color }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.icon, { color: config.color }]}>{config.icon}</Text>
      <Text style={[styles.message, { color: config.color }]}>{message}</Text>
      {dismissible && onDismiss && (
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.dismissButton}
          accessibilityLabel="Dismiss alert"
          accessibilityRole="button"
        >
          <Text style={[styles.dismissText, { color: config.color }]}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing[4],
  },
  icon: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    marginRight: spacing[3],
  },
  message: {
    flex: 1,
    fontSize: typography.fontSize.sm,
  },
  dismissButton: {
    padding: spacing[1],
    marginLeft: spacing[2],
  },
  dismissText: {
    fontSize: typography.fontSize.lg,
    opacity: 0.7,
  },
});

export default Alert;
