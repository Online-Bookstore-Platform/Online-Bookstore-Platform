import { Link } from 'react-router-dom';
import Container from '../Container/Container.jsx';
import styles from './Footer.module.css';

export default function Footer() {
  return <footer className={styles.footer}><Container>
    <div className={styles.top}><div><Link className={styles.brand} to="/">folio<span>.</span></Link><p>A little more room for the stories<br />that stay with you.</p></div>
      <div className={styles.column}><h2>Explore</h2><Link to="/catalogue">Discover books</Link><a href="/#categories">Categories</a><a href="/#about">Our point of view</a></div>
      <div className={styles.column}><h2>Your folio</h2><Link to="/login">Account</Link><Link to="/cart">Cart</Link><Link to="/orders">Orders</Link></div>
      <div className={styles.column}><h2>Here to help</h2><a href="mailto:hello@folio.example">Get in touch</a><Link to="/profile">Your profile</Link></div>
    </div><div className={styles.bottom}><span>© 2026 folio. A project prototype.</span><span>Made for the love of a good story.</span></div>
  </Container></footer>;
}
