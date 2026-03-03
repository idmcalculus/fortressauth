'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, type FormEvent, useEffect, useMemo, useState } from 'react';
import { postAuthJson } from '@/lib/auth-api';
import styles from '../auth-pages.module.css';

type VerifyEmailResult = {
  verified: boolean;
};

type Status = 'idle' | 'loading' | 'success' | 'error';

function getVerifyErrorMessage(errorCode?: string): string {
  switch (errorCode) {
    case 'EMAIL_VERIFICATION_EXPIRED':
      return 'This verification link has expired. Request a new verification email.';
    case 'EMAIL_VERIFICATION_INVALID':
      return 'This verification token is invalid.';
    case 'RATE_LIMIT_EXCEEDED':
      return 'Too many attempts. Please wait and try again.';
    case 'CSRF_TOKEN_INVALID':
      return 'Security token expired. Refresh and try again.';
    default:
      return 'Email verification failed. Please try again.';
  }
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}

function VerifyEmailPageContent() {
  const searchParams = useSearchParams();
  const tokenFromQuery = useMemo(() => searchParams.get('token') ?? '', [searchParams]);
  const [token, setToken] = useState(tokenFromQuery);
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
      setMessage('Verification token is required.');
      return;
    }

    setStatus('loading');
    setMessage('Verifying your email...');

    const result = await postAuthJson<VerifyEmailResult>('/auth/verify-email', {
      token: nextToken,
    });

    if (result.success && result.data?.verified) {
      setStatus('success');
      setMessage('Email verified successfully. You can now sign in from any demo app.');
      return;
    }

    setStatus('error');
    setMessage(getVerifyErrorMessage(result.error));
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Verify Email</h1>
        <p className={styles.description}>
          Confirm your account using the verification token sent to your inbox.
        </p>

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
          <label className={styles.label} htmlFor="verification-token">
            Verification token
            <input
              id="verification-token"
              className={styles.input}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="selector:verifier"
              autoComplete="off"
              disabled={status === 'loading'}
              required
            />
          </label>

          <button className={styles.button} type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <div className={styles.footer}>
          <Link className={styles.link} href="/">
            Back to home
          </Link>
          <Link className={styles.link} href="/reset-password">
            Need to reset password?
          </Link>
        </div>
      </section>
    </main>
  );
}
