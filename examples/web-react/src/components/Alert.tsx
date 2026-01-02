/**
 * FortressAuth - Alert Component
 * Displays feedback messages to users with appropriate styling.
 */

import type React from 'react';
import './Alert.css';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps {
  type: AlertType;
  message: string;
  onDismiss?: () => void;
  dismissible?: boolean;
  className?: string;
}

const alertIcons: Record<AlertType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const alertLabels: Record<AlertType, string> = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Information',
};

export const Alert: React.FC<AlertProps> = ({
  type,
  message,
  onDismiss,
  dismissible = true,
  className = '',
}) => {
  return (
    <div
      className={`alert alert-${type} ${className}`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="alert-icon" aria-hidden="true">
        {alertIcons[type]}
      </span>
      <span className="sr-only">{alertLabels[type]}:</span>
      <span className="alert-message">{message}</span>
      {dismissible && onDismiss && (
        <button
          type="button"
          className="alert-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss alert"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default Alert;
