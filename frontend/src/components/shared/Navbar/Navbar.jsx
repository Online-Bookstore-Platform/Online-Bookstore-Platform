import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '../../../features/varchas/api.js';
import styles from './Navbar.module.css';

export default function Navbar() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => { let active = true; getCurrentUser().then(({ user: current }) => { if (active) setUser(current); }).catch(() => { if (active) setUser(null); }); return () => { active = false; }; }, [location.pathname]);
  useEffect(() => { document.documentElement.dataset.theme = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1b1c1a' : '#f7f6f2'); try { localStorage.setItem('folio-theme', theme); } catch {} }, [theme]);
  return <nav className={styles.nav} aria-label="Main navigation"><div className={`${styles.inner} container`}>
    <Link className={styles.brand} to="/" aria-label="folio home">folio<span>.</span></Link>
    <div className={styles.links}>
      <NavLink to="/catalogue">Discover</NavLink><NavLink to="/categories">Categories</NavLink><NavLink to="/about">About</NavLink>
    </div>
    <div className={styles.actions}><Link to="/profile" aria-label="Account">Account</Link>{user?.role === 'admin' && <><Link to="/admin">Manage catalogue</Link><Link to="/inventory">Inventory</Link></>}<Link to="/cart" aria-label="Cart">Cart <span aria-hidden="true">↗</span></Link><button className={styles.theme} type="button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-pressed={theme === 'dark'} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☼' : '◐'}</button></div>
  </div></nav>;
}
