/**
 * FortressAuth - Input Component
 * Accessible form input with validation states and error messages.
 */

import type React from 'react';
import { useId } from 'react';
import './Input.css';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  className = '',
  required,
  ...props
}) => {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const hasError = Boolean(error);
  const describedBy =
    [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`form-group ${hasError ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id} className="form-label">
        {label}
        {required && (
          <span className="form-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>

      <input
        id={id}
        className={`form-input ${hasError ? 'input-error' : ''}`}
        aria-invalid={hasError}
        aria-describedby={describedBy}
        aria-required={required}
        required={required}
        {...props}
      />

      {hint && !hasError && (
        <p id={hintId} className="form-hint">
          {hint}
        </p>
      )}

      {hasError && (
        <p id={errorId} className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default Input;
