import { Link } from 'react-router-dom';
import BookCard from '../../../components/shared/BookCard/BookCard.jsx';
import { formatPrice, statusClass, stockLabel } from '../shared/format.js';
import { paletteFor } from './catalogueParams.js';
import styles from './Catalogue.module.css';

/**
 * One book in the results: the shared BookCard (linked to Varchas's book-details page),
 * its price, the real availability from the backend, and an Add to cart button that
 * calls the cart API. `cartState` = { busy, message, error, signIn, added } for this book.
 */
export default function BookResult({ book, index, cartState, onAdd }) {
  const busy = Boolean(cartState?.busy);
  const unavailable = !book.available;

  return (
    <li className={styles.item}>
      <Link className={styles.cardLink} to={`/books/${book.id}`} aria-label={`${book.title} by ${book.author}. View details`}>
        <BookCard title={book.title} author={book.author} category={book.category} cover="" palette={paletteFor(book.categoryId)} index={index} />
      </Link>
      <div className={styles.buy}>
        <div className={styles.priceRow}>
          <p className={styles.price}>{formatPrice(book.price, book.currency)}</p>
          <p className={`${styles.stock} ${styles[statusClass(book.stockStatus)] || ''}`}>{stockLabel(book.stockStatus)}</p>
        </div>
        <button className={styles.add} type="button" onClick={() => onAdd(book)} disabled={unavailable || busy} aria-label={unavailable ? `${book.title} is out of stock` : `Add ${book.title} to your cart`}>
          {busy ? 'Adding…' : unavailable ? 'Out of stock' : 'Add to cart'}
        </button>
        {cartState?.message && (
          <p className={cartState.error ? styles.cartError : styles.cartSuccess} role={cartState.error ? 'alert' : 'status'}>
            {cartState.message}{' '}
            {cartState.signIn && <Link to="/login?next=%2Fcatalogue">Sign in</Link>}
            {cartState.added && <Link to="/cart">View cart</Link>}
          </p>
        )}
      </div>
    </li>
  );
}
