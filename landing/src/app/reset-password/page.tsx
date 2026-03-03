'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { postAuthJson } from '@/lib/auth-api';
import styles from '../auth-pages.module.css';

type ResetPasswordResult = {
  reset: boolean;
};

type Status = 'idle' | 'loading' | 'success' | 'error';

function getResetErrorMessage(errorCode?: string): string {
  switch (errorCode) {
    case 'PASSWORD_RESET_EXPIRED':
      return 'This reset link has expired. Request a new password reset.';
    case 'PASSWORD_RESET_INVALID':
      return 'This reset token is invalid.';
    case 'PASSWORD_TOO_WEAK':
      return 'Choose a stronger password that meets minimum length requirements.';
    case 'RATE_LIMIT_EXCEEDED':
      return 'Too many attempts. Please wait and try again.';
    case 'CSRF_TOKEN_INVALID':
      return 'Security token expired. Refresh and try again.';
    default:
      return 'Password reset failed. Please try again.';
  }
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const tokenFromQuery = useMemo(() => searchParams.get('token') ?? '', [searchParams]);
  const [token, setToken] = useState(tokenFromQuery);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (tokenFromQuery) {
      setToken(tokenFromQuery);
    }
  }, [tokenFromQuery]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextToken = token.trim();
    if (!nextToken) {
      setStatus('error');
      setMessage('Reset token is required.');
      return;
    }

    if (newPassword.length < 8) {
      setStatus('error');
      setMessage('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus('error');
      setMessage('Password confirmation does not match.');
      return;
    }

    setStatus('loading');
    setMessage('Resetting your password...');

    const result = await postAuthJson<ResetPasswordResult>('/auth/reset-password', {
      token: nextToken,
      newPassword,
    });

    if (result.success && result.data?.reset) {
      setStatus('success');
      setMessage('Password reset successful. You can now sign in with your new password.');
      setToken('');
      setNewPassword('');
      setConfirmPassword('');
      return;
    }

    setStatus('error');
    setMessage(getResetErrorMessage(result.error));
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Reset Password</h1>
        <p className={styles.description}>Use your reset token to create a new password.</p>

        {(status === 'success' || status === 'error') && (
          <p
            className={`${styles.status} ${
              status === 'success' ? styles.statusSuccess : styles.statusError
            }`}
          >
            {message}
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="reset-token">
            Reset token
            <input
              id="reset-token"
              className={styles.input}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="selector:verifier"
              autoComplete="off"
              disabled={status === 'loading'}
              required
            />
          </label>

          <label className={styles.label} htmlFor="new-password">
            New password
            <input
              id="new-password"
              className={styles.input}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              disabled={status === 'loading'}
              required
            />
          </label>

          <label className={styles.label} htmlFor="confirm-password">
            Confirm password
            <input
              id="confirm-password"
              className={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              disabled={status === 'loading'}
              required
            />
          </label>

          <button className={styles.button} type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <div className={styles.footer}>
          <Link className={styles.link} href="/">
            Back to home
          </Link>
          <Link className={styles.link} href="/verify-email">
            Need to verify email?
          </Link>
        </div>
      </section>
    </main>
  );
}
