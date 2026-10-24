import { useState } from 'react';
import { Link } from 'react-router-dom';
import BookCard from '../../../components/shared/BookCard/BookCard.jsx';
import { formatPrice, statusClass, stockLabel } from '../shared/format.js';
import { addToCart, isPurchasable } from './api.js';
import { paletteFor } from './catalogueParams.js';
import styles from './Catalogue.module.css';

export default function BookResult({ book, index }) {
  const [cartState, setCartState] = useState({ busy: false, message: '', error: '' });
  const purchasable = isPurchasable(book);
  const year = book.firstPublishYear ? `First published ${book.firstPublishYear}` : 'Publication year unavailable';
  async function addBook() {
    setCartState({ busy: true, message: '', error: '' });
    try {
      await addToCart(book.storeProduct.id);
      setCartState({ busy: false, message: 'Added to your cart.', error: '' });
    } catch (error) {
      setCartState({ busy: false, message: '', error: error.message });
    }
  }
  return <li className={styles.item}>
    <Link className={styles.cardLink} to={`/books/${encodeURIComponent(book.id)}`} aria-label={`${book.title} by ${book.author}. View details`}>
      <BookCard title={book.title} author={book.author} category={year} cover={book.coverImageUrl} palette={paletteFor(book.categoryId)} index={index} />
    </Link>
    <div className={styles.buy}>
      {purchasable
        ? <>
          <div className={styles.priceRow}>
            <p className={styles.price}>{formatPrice(book.storeProduct.price, book.storeProduct.currency)}</p>
            <p className={`${styles.stock} ${styles[statusClass(book.storeProduct.stockStatus)] || ''}`}>{stockLabel(book.storeProduct.stockStatus)}</p>
          </div>
          <button className={styles.add} type="button" aria-label={book.storeProduct.available ? `Add ${book.title} to your cart` : `${book.title} is out of stock`} disabled={!book.storeProduct.available || cartState.busy} onClick={addBook}>
            {cartState.busy ? 'Adding…' : book.storeProduct.available ? 'Add to cart' : 'Out of stock'}
          </button>
          {cartState.message && <p className={styles.cartSuccess} role="status">{cartState.message} <Link to="/cart">View cart</Link></p>}
          {cartState.error && <p className={styles.cartError} role="alert">{cartState.error}{/sign in/i.test(cartState.error) && <> <Link to="/login">Sign in</Link></>}</p>}
        </>
        : <p className={styles.stock}>Discovery only · not sold by folio.</p>}
    </div>
  </li>;
}
