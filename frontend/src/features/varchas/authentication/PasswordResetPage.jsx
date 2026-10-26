import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api.js';
import styles from './Authentication.module.css';

export default function PasswordResetPage({ reset = false }) {
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [devLink, setDevLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const token = params.get('token') || '';

  async function submit(event) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      if (reset) {
        await apiRequest('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
        setMessage('Your password has been changed. Sign in with your new password.');
      } else {
        const result = await apiRequest('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
        setMessage(result.message);
        if (result.developmentToken) setDevLink(`${window.location.origin}/reset-password?token=${encodeURIComponent(result.developmentToken)}`);
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return <section className={styles.page}><div className={styles.card}>
    <p className="eyebrow">Account access</p><h1>{reset ? 'Choose a new password.' : 'Reset your password.'}</h1>
    <p className={styles.intro}>{reset ? 'Use a new password you have not used here before.' : 'Enter your account email and we’ll send reset instructions if it matches an account.'}</p>
    {reset && !token ? <p className={styles.error} role="alert">This reset link is incomplete. Request another link.</p> : <form onSubmit={submit}>
      {!reset && <><label htmlFor="reset-email">Email address</label><input id="reset-email" type="email" autoComplete="email" required maxLength={255} value={email} onChange={event => setEmail(event.target.value)} />{!message && <button className={styles.submit} disabled={busy}>{busy ? 'Sending…' : 'Send reset instructions'}</button>}</>}
      {reset && <><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={password} onChange={event => setPassword(event.target.value)} /><button className={styles.submit} disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button></>}
      {error && <p className={styles.error} role="alert">{error}</p>}{message && <p role="status">{message}</p>}{devLink && <p role="status">Local development reset link: <a href={devLink}>Continue password reset</a></p>}
    </form>}
    <p className={styles.register}><Link to="/login">Return to sign in</Link></p>
  </div></section>;
}
