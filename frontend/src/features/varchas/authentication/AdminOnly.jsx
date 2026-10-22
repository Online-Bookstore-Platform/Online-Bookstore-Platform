import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../api.js';
import styles from './Authentication.module.css';

export default function AdminOnly({ children }) {
  const [state, setState] = useState({ loading: true, user: null, error: '' });
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getCurrentUser().then(({ user }) => { if (active) setState({ loading: false, user, error: '' }); }).catch(error => {
      if (!active) return;
      if (error.status === 401) navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
      else setState({ loading: false, user: null, error: error.message });
    });
    return () => { active = false; };
  }, [location.pathname, navigate]);

  if (state.loading) return <section className={styles.guard} aria-live="polite">Checking your access…</section>;
  if (state.error) return <section className={styles.guard} role="alert"><p>We couldn’t verify administrator access.</p><p>{state.error}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></section>;
  if (state.user?.role !== 'admin') return <section className={styles.guard} role="status"><p>Administrator access is required.</p><Link to="/">Return to folio</Link></section>;
  return children;
}
