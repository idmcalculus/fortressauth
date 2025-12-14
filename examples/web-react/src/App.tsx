import { useAuth, useUser } from '@fortressauth/react-sdk';
import type React from 'react';
import { useEffect, useState } from 'react';

type Credentials = { email: string; password: string };

const emptyCreds: Credentials = { email: '', password: '' };

export default function App() {
  const { user, loading, error } = useUser();
  const { signUp, signIn, signOut, verifyEmail, requestPasswordReset, resetPassword } = useAuth();

  const [signup, setSignup] = useState<Credentials>(emptyCreds);
  const [signin, setSignin] = useState<Credentials>(emptyCreds);
  const [verifyToken, setVerifyToken] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setVerifyToken(token);
      void verifyEmail(token).then((res) => {
        setMessage(
          res.success
            ? 'Email verified. You can now sign in.'
            : (res.error ?? 'Verification failed'),
        );
      });
    }
  }, [verifyEmail]);

  const handleVerify = async (tokenValue?: string) => {
    const token = tokenValue ?? verifyToken;
    if (!token) return;
    const res = await verifyEmail(token);
    setMessage(
      res.success ? 'Email verified. You can now sign in.' : (res.error ?? 'Verification failed'),
    );
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await signUp(signup.email, signup.password);
    setMessage(
      res.success
        ? 'Signed up. Check your email for verification.'
        : (res.error ?? 'Sign up failed'),
    );
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await signIn(signin.email, signin.password);
    setMessage(res.success ? 'Signed in.' : (res.error ?? 'Sign in failed'));
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await requestPasswordReset(resetEmail);
    setMessage(res.success ? 'Password reset email sent.' : (res.error ?? 'Request failed'));
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await resetPassword(resetToken, newPassword);
    setMessage(res.success ? 'Password reset. You can sign in.' : (res.error ?? 'Reset failed'));
  };

  return (
    <div>
      <h1>FortressAuth React Demo</h1>
      <p className="muted">Simple flows for signup, login, verification, and password reset.</p>

      {message ? <div className="message">{message}</div> : null}
      {error ? <div className="message">Last error: {error}</div> : null}

      <div className="card">
        <h3>Session</h3>
        {loading ? (
          <p className="muted">Loading session...</p>
        ) : user ? (
          <div>
            <p>
              Signed in as <strong>{user.email}</strong> (
              {user.emailVerified ? 'verified' : 'unverified'})
            </p>
            <p className="muted">User ID: {user.id}</p>
            <button
              type="button"
              onClick={() => void signOut().then(() => setMessage('Signed out.'))}
            >
              Sign out
            </button>
          </div>
        ) : (
          <p className="muted">Not signed in.</p>
        )}
      </div>

      <div className="stack">
        <div className="card">
          <h3>Sign up</h3>
          <form onSubmit={handleSignup}>
            <input
              placeholder="Email"
              type="email"
              value={signup.email}
              onChange={(e) => setSignup({ ...signup, email: e.target.value })}
              required
            />
            <input
              placeholder="Password"
              type="password"
              value={signup.password}
              onChange={(e) => setSignup({ ...signup, password: e.target.value })}
              required
            />
            <button type="submit">Create account</button>
            <p className="muted">A verification email will be sent.</p>
          </form>
        </div>

        <div className="card">
          <h3>Sign in</h3>
          <form onSubmit={handleSignin}>
            <input
              placeholder="Email"
              type="email"
              value={signin.email}
              onChange={(e) => setSignin({ ...signin, email: e.target.value })}
              required
            />
            <input
              placeholder="Password"
              type="password"
              value={signin.password}
              onChange={(e) => setSignin({ ...signin, password: e.target.value })}
              required
            />
            <button type="submit">Sign in</button>
          </form>
        </div>

        <div className="card">
          <h3>Email verification</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleVerify();
            }}
          >
            <input
              placeholder="Token from email"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
            />
            <button type="submit">Verify email</button>
            <p className="muted">Token format: selector:verifier</p>
          </form>
        </div>

        <div className="card">
          <h3>Password reset</h3>
          <form onSubmit={handleRequestReset}>
            <input
              placeholder="Email"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
            />
            <button type="submit">Request reset</button>
          </form>
          <hr />
          <form onSubmit={handleResetPassword}>
            <input
              placeholder="Reset token"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              required
            />
            <input
              placeholder="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button type="submit">Set new password</button>
          </form>
        </div>
      </div>
    </div>
  );
}
