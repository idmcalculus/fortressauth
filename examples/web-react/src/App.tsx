import { useAuth, useUser } from '@fortressauth/react-sdk';
import { useState } from 'react';
import './App.css';

export default function App() {
  const { signUp, signIn, signOut, verifyEmail, requestPasswordReset, resetPassword } = useAuth();
  const { user, loading, error } = useUser();

  const [mode, setMode] = useState<'signin' | 'signup' | 'verify' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [showResetOverlay, setShowResetOverlay] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setMessage('Passwords do not match');
        return;
      }
      const res = await signUp(email, password);
      if (res.success) setMessage('Verification email sent!');
    } else if (mode === 'signin') {
      await signIn(email, password);
    } else if (mode === 'verify') {
      const res = await verifyEmail(token);
      if (res.success) {
        setMessage('Email verified! You can now sign in.');
        setMode('signin');
      }
    } else if (mode === 'reset') {
      if (password !== confirmPassword) {
        setMessage('Passwords do not match');
        return;
      }
      const res = await resetPassword(token, password);
      if (res.success) {
        setMessage('Password reset successful. Please sign in.');
        setMode('signin');
      }
    }
  };

  const handleRequestReset = async () => {
    const res = await requestPasswordReset(email);
    if (res.success) {
      setMessage('Password reset email sent.');
      setShowResetOverlay(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <img src="/react-demo/logo.svg" alt="FortressAuth Logo" className="logo" />
        <h1 className="title">FortressAuth React</h1>
      </div>

      {loading ? (
        <div className="loading">Loading session...</div>
      ) : user ? (
        <div className="success">
          <p>Welcome, <span className="user-email">{user.email}</span>!</p>
          <p style={{ margin: '1rem 0', color: '#a0aec0' }}>
            Email verified: {user.emailVerified ? '✅ Yes' : '❌ No'}
          </p>
          <button className="btn btn-secondary" onClick={() => signOut()}>Sign Out</button>
        </div>
      ) : (
        <>
          <div className="tabs">
            <button className={`tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => setMode('signin')}>Sign In</button>
            <button className={`tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>Sign Up</button>
            <button className={`tab ${mode === 'verify' ? 'active' : ''}`} onClick={() => setMode('verify')}>Verify</button>
            <button className={`tab ${mode === 'reset' ? 'active' : ''}`} onClick={() => setMode('reset')}>Reset</button>
          </div>

          <form onSubmit={handleSubmit}>
            {(mode === 'signin' || mode === 'signup') && (
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required />
              </div>
            )}

            {mode === 'reset' && (
              <div className="form-group">
                <label>Reset Token</label>
                <input type="text" value={token} onChange={(e) => setToken(e.target.value)} placeholder="selector:verifier" required />
              </div>
            )}

            {mode === 'verify' && (
              <div className="form-group">
                <label>Verification Token</label>
                <input type="text" value={token} onChange={(e) => setToken(e.target.value)} placeholder="selector:verifier" required />
              </div>
            )}


            {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
              <div className="form-group">
                <label>{mode === 'reset' ? 'New Password' : 'Password'}</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
            )}

            {(mode === 'signup' || mode === 'reset') && (
              <div className="form-group">
                <label>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Processing...' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : mode === 'verify' ? 'Verify Email' : 'Reset Password'}
            </button>

            {mode === 'signin' && (
              <div className="forgot-password">
                <a href="#" onClick={(e) => { e.preventDefault(); setShowResetOverlay(true); }}>Forgot password?</a>
              </div>
            )}
          </form>

          {showResetOverlay && (
            <div className="overlay">
              <div className="modal">
                <h3>Reset Password</h3>
                <p className="muted">Enter your email to receive a reset link.</p>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
                </div>
                <button className="btn btn-primary" onClick={handleRequestReset}>Send Reset Link</button>
                <button className="btn btn-secondary" onClick={() => setShowResetOverlay(false)}>Cancel</button>
              </div>
            </div>
          )}

          {error && <div className="error">{error}</div>}
          {message && <div className="message">{message}</div>}
        </>
      )}
    </div>
  );
}
