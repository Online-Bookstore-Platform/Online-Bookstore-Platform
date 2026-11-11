import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api.js';
import styles from './Authentication.module.css';

export default function PasswordResetPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [step, setStep] = useState('request');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  async function submit(event) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      if (step === 'request' || step === 'resend') {
        const result = await apiRequest('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
        setMessage(result.message); setStep('verify'); setResendIn(60);
        const timer = window.setInterval(() => setResendIn(value => { if (value <= 1) { window.clearInterval(timer); return 0; } return value - 1; }), 1000);
      } else if (step === 'verify') {
        const result = await apiRequest('/api/auth/verify-reset-otp', { method: 'POST', body: JSON.stringify({ email, otp }) });
        setResetToken(result.resetToken); setStep('password');
      } else {
        if (password !== confirmation) throw new Error('The passwords do not match.');
        await apiRequest('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken, password }) });
        setStep('complete');
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  const resend = async () => { if (resendIn || busy) return; setStep('resend'); };
  return <section className={styles.page}><div className={styles.card}>
    <p className="eyebrow">Account access</p><h1>{step === 'complete' ? 'Password updated.' : step === 'verify' ? 'Check your inbox.' : step === 'password' ? 'Choose a new password.' : 'Reset your password.'}</h1>
    <p className={styles.intro}>{step === 'request' || step === 'resend' ? 'Enter your account email and we’ll send a six-digit verification code if email delivery is configured.' : step === 'verify' ? 'Enter the six-digit code sent to your registered email. It expires in five minutes.' : step === 'password' ? 'Your email is verified. Choose a new password.' : 'You can now sign in with your new password.'}</p>
    {step !== 'complete' && <form onSubmit={submit}>
      {(step === 'request' || step === 'resend') && <><label htmlFor="reset-email">Email address</label><input id="reset-email" type="email" autoComplete="email" required maxLength={255} value={email} onChange={event => setEmail(event.target.value)} /><button className={styles.submit} disabled={busy}>{busy ? 'Sending…' : 'Send verification code'}</button></>}
      {step === 'verify' && <><label htmlFor="reset-otp">Six-digit code</label><input id="reset-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} /><button className={styles.submit} disabled={busy}>{busy ? 'Verifying…' : 'Verify code'}</button><button type="button" className={styles.submit} disabled={busy || resendIn > 0} onClick={resend}>{resendIn ? `Resend in ${resendIn}s` : 'Resend code'}</button></>}
      {step === 'password' && <><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={password} onChange={event => setPassword(event.target.value)} /><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /><button className={styles.submit} disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button></>}
      {error && <p className={styles.error} role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    </form>}
    {step === 'complete' && <p role="status">All existing sessions have been signed out.</p>}
    <p className={styles.register}><Link to="/login">Return to sign in</Link></p>
  </div></section>;
}
