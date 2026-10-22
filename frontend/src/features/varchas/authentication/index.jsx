import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api.js';
import styles from './Authentication.module.css';

export default function AuthenticationPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [query] = useSearchParams();

  async function submit(event) {
    event.preventDefault();
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || password.length < 8) {
      setError('Enter a valid email address and a password with at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: normalizedEmail, password }) });
      const next = query.get('next');
      navigate(next?.startsWith('/') && !next.startsWith('//') ? next : result.user.role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.page}><div className={styles.card}>
    <p className="eyebrow">Welcome back</p><h1>Come on in.</h1><p className={styles.intro}>Sign in to continue your reading journey.</p>
    <form onSubmit={submit} noValidate>
      <label htmlFor="login-email">Email address</label><input id="login-email" name="email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required />
      <label htmlFor="login-password">Password</label><input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} required />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">↗</span></button>
    </form>
    <p className={styles.register}>New to folio? <Link to="/register">Create an account</Link></p>
  </div></section>;
}
