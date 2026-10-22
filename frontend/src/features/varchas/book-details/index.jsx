import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../api.js';
import styles from './BookDetails.module.css';

const validId = value => /^[\w-]{1,64}$/.test(value || '');

export default function BookDetailsPage() {
  const { bookId } = useParams();
  const [state, setState] = useState({ status: 'loading', book: null, message: '' });
  const [cartState, setCartState] = useState({ busy: false, message: '', error: false });

  useEffect(() => {
    let active = true;
    if (!validId(bookId)) {
      setState({ status: 'invalid', book: null, message: 'This book link is not valid.' });
      return () => { active = false; };
    }
    setState({ status: 'loading', book: null, message: '' });
    apiRequest(`/api/books/${encodeURIComponent(bookId)}`).then(({ book }) => {
      if (active) setState(book ? { status: 'ready', book, message: '' } : { status: 'unavailable', book: null, message: 'We couldn’t find this book.' });
    }).catch(error => {
      if (active) setState({ status: error.status === 404 ? 'unavailable' : 'error', book: null, message: error.status === 404 ? 'We couldn’t find this book.' : error.message });
    });
    return () => { active = false; };
  }, [bookId]);

  async function addToCart() {
    setCartState({ busy: true, message: '', error: false });
    try {
      await apiRequest('/api/cart/items', { method: 'POST', body: JSON.stringify({ bookId, quantity: 1 }) });
      setCartState({ busy: false, message: 'Added to your cart.', error: false });
    } catch (error) {
      setCartState({ busy: false, message: error.message, error: true });
    }
  }

  if (state.status === 'loading') return <section className={styles.state} aria-live="polite">Finding this book…</section>;
  if (state.status !== 'ready') return <section className={styles.state} role={state.status === 'error' ? 'alert' : 'status'}><p className="eyebrow">Book details</p><h1>{state.status === 'unavailable' ? 'This one is out of reach.' : 'We hit a small snag.'}</h1><p>{state.message}</p><Link to="/catalogue">← Back to the catalogue</Link></section>;

  const { book } = state;
  const unavailable = book.available === false || book.availability === 'unavailable';
  return <article className={styles.page}><div className={styles.back}><Link to="/catalogue">← Back to the catalogue</Link></div><div className={styles.layout}>
    <div className={styles.cover}>{book.coverImageUrl ? <img src={book.coverImageUrl} alt={`Cover of ${book.title}`} /> : <div className={styles.coverFallback} aria-label={`Cover placeholder for ${book.title}`} role="img"><span>{book.category || 'A folio book'}</span><strong>{book.title}</strong><small>{book.author}</small></div>}</div>
    <div className={styles.info}><p className="eyebrow">{book.category || 'A folio book'}</p><h1>{book.title}</h1><p className={styles.author}>by {book.author}</p><p className={styles.description}>{book.description || 'A little more about this book will be here soon.'}</p><p className={styles.price}>{book.price == null ? 'Price unavailable' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: book.currency || 'INR' }).format(Number(book.price))}</p><p className={styles.availability}>{book.availability || (unavailable ? 'Currently unavailable' : book.available === true ? 'Available' : 'Availability to be confirmed')}</p>
      <button className={styles.add} type="button" onClick={addToCart} disabled={unavailable || cartState.busy}>{cartState.busy ? 'Adding…' : unavailable ? 'Currently unavailable' : 'Add to cart'} <span aria-hidden="true">↗</span></button>
      {cartState.message && <p className={cartState.error ? styles.error : styles.success} role={cartState.error ? 'alert' : 'status'}>{cartState.message}</p>}
      <dl className={styles.facts}>{book.isbn && <div><dt>ISBN</dt><dd>{book.isbn}</dd></div>}{book.category && <div><dt>Category</dt><dd>{book.category}</dd></div>}</dl>
    </div>
  </div></article>;
}
