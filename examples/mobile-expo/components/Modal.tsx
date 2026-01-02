/**
 * FortressAuth - Modal Component for React Native
 * Accessible modal dialog.
 */

import type React from 'react';
import {
  Modal as RNModal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { borderRadius, colors, spacing, typography } from '../styles/designTokens';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, description, children }) => {
  return (
    <RNModal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={styles.modal}
              accessibilityRole="none"
              accessibilityLabel={title}
              accessible={true}
            >
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                  accessibilityLabel="Close dialog"
                  accessibilityRole="button"
                >
                  <Text style={styles.closeText}>×</Text>
                </TouchableOpacity>
              </View>

              {description && <Text style={styles.description}>{description}</Text>}

              <View style={styles.content}>{children}</View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  modal: {
    backgroundColor: colors.bg.secondary,
    padding: spacing[8],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border.secondary,
    width: '100%',
    maxWidth: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  closeButton: {
    padding: spacing[1],
  },
  closeText: {
    fontSize: typography.fontSize['2xl'],
    color: colors.text.secondary,
  },
  description: {
    marginBottom: spacing[6],
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  content: {},
});

export default Modal;
