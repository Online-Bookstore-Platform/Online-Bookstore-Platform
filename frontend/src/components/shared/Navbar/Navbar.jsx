import { Link, NavLink } from 'react-router-dom';
import styles from './Navbar.module.css';

export default function Navbar() {
  return <nav className={styles.nav} aria-label="Main navigation"><div className={`${styles.inner} container`}>
    <Link className={styles.brand} to="/" aria-label="folio home">folio<span>.</span></Link>
    <div className={styles.links}>
      <NavLink to="/catalogue">Discover</NavLink><a href="/#categories">Categories</a><a href="/#about">About</a>
    </div>
    <div className={styles.actions}><Link to="/profile" aria-label="Account">Account</Link><Link to="/cart" aria-label="Cart">Cart <span aria-hidden="true">↗</span></Link></div>
  </div></nav>;
}
