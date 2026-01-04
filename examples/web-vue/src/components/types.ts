/**
 * FortressAuth - Vue Component Types
 * Shared type definitions for Vue components.
 */

// Alert types
export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps {
  type: AlertType;
  message: string;
  dismissible?: boolean;
}

// Button types
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  fullWidth?: boolean;
}

// Input types
export interface InputProps {
  type?: 'text' | 'email' | 'password' | 'tel' | 'url';
  label: string;
  modelValue: string;
  placeholder?: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
}

// Modal types
export interface ModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
}
