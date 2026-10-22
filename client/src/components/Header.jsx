import { Link, NavLink } from 'react-router-dom';
import SearchBar from './SearchBar.jsx';

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="wordmark">
          Online Bookstore
        </Link>
        <SearchBar />
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/" end>
            Books
          </NavLink>
          <NavLink to="/checkout">Checkout</NavLink>
        </nav>
      </div>
    </header>
  );
}
