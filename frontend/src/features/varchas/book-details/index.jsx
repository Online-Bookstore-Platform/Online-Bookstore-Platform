import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../api.js';
import { formatPrice, stockLabel } from '../../uditi/shared/format.js';
import { addToCart, isPurchasable } from '../../uditi/catalogue/api.js';
import styles from './BookDetails.module.css';

const validId = value => /^(?:works\/OL\d+W|volumes\/[\w-]+)$/.test(value || '');
const hasOpenLibraryReviews = value => /^works\/OL\d+W$/.test(value || '');

export default function BookDetailsPage() {
  const { bookId } = useParams();
  const [state, setState] = useState({ status: 'loading', book: null, message: '' });
  const [reviews, setReviews] = useState({ status: 'loading', items: [], count: 0, average: null, message: '' });
  const [review, setReview] = useState({ rating: '5', content: '' });
  const [reviewBusy, setReviewBusy] = useState(false);
  const [editingReview, setEditingReview] = useState(null);
  const [cartState, setCartState] = useState({ busy: false, message: '', error: '' });
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!validId(bookId)) {
      setState({ status: 'invalid', book: null, message: 'This book link is not valid.' });
      return () => { active = false; };
    }
    setState({ status: 'loading', book: null, message: '' });
    setCoverFailed(false);
    apiRequest(`/api/catalogue/books/${encodeURIComponent(bookId)}`).then(({ book }) => {
      if (active) setState(book ? { status: 'ready', book, message: '' } : { status: 'unavailable', book: null, message: 'We couldn’t find this book.' });
    }).catch(error => {
      if (active) setState({ status: error.status === 404 ? 'unavailable' : 'error', book: null, message: error.status === 404 ? 'We couldn’t find this book.' : error.message });
    });
    return () => { active = false; };
  }, [bookId]);

  async function loadReviews() {
    try {
      const response = await apiRequest(`/api/books/${encodeURIComponent(bookId)}/reviews`);
      setReviews({ status: 'ready', items: response.reviews || [], count: response.summary.count, average: response.summary.average, message: '' });
    } catch (error) { setReviews({ status: 'error', items: [], count: 0, average: null, message: error.message }); }
  }
  useEffect(() => { if (hasOpenLibraryReviews(bookId)) loadReviews(); }, [bookId]);

  async function submitReview(event) {
    event.preventDefault();
    setReviewBusy(true);
    try {
      await apiRequest(`/api/books/${encodeURIComponent(bookId)}/reviews${editingReview ? `/${editingReview}` : ''}`, { method: editingReview ? 'PATCH' : 'POST', body: JSON.stringify({ rating: Number(review.rating), content: review.content }) });
      setReview({ rating: '5', content: '' });
      setEditingReview(null);
      await loadReviews();
    } catch (error) { setReviews(current => ({ ...current, message: error.message })); }
    finally { setReviewBusy(false); }
  }
  async function deleteReview(id) {
    try { await apiRequest(`/api/books/${encodeURIComponent(bookId)}/reviews/${id}`, { method: 'DELETE' }); await loadReviews(); }
    catch (error) { setReviews(current => ({ ...current, message: error.message })); }
  }

  async function addBookToCart() {
    if (!isPurchasable(state.book) || !state.book.storeProduct.available) return;
    setCartState({ busy: true, message: '', error: '' });
    try {
      await addToCart(state.book.storeProduct.id);
      setCartState({ busy: false, message: 'Added to your cart.', error: '' });
    } catch (error) {
      setCartState({ busy: false, message: '', error: error.message });
    }
  }

  if (state.status === 'loading') return <section className={styles.state} aria-live="polite">Finding this book…</section>;
  if (state.status !== 'ready') return <section className={styles.state} role={state.status === 'error' ? 'alert' : 'status'}><p className="eyebrow">Book details</p><h1>{state.status === 'unavailable' ? 'This one is out of reach.' : 'We hit a small snag.'}</h1><p>{state.message}</p><Link to="/catalogue">← Back to the catalogue</Link></section>;

  const { book } = state;
  const purchasable = isPurchasable(book);
  const detailCover = book.coverImageUrl?.replace(/-M\.jpg(?=\?)/, '-L.jpg') || book.inventoryDetails?.coverImageUrl;
  const description = book.description || book.inventoryDetails?.description;
  const readable = book.reading?.url && ['full access', 'lendable'].includes(book.reading.status);
  const readingStatus = book.reading?.status;
  const readingMessage = book.provider !== 'openlibrary' ? '' : readingStatus === 'restricted'
    ? 'The identified edition is restricted. Check the Open Library record for access options.'
    : readingStatus === 'checked out'
      ? 'The identified loan edition is currently checked out. Check the Open Library record for updates.'
      : readingStatus && !readable
        ? 'Open Library found an edition but did not provide a supported reader link. Check the book record for access options.'
        : 'No online-readable edition was identified. Check the Open Library record for current access options.';
  return <article className={styles.page}><div className={styles.back}><Link to="/catalogue">← Back to the catalogue</Link></div><div className={styles.layout}>
    <div className={styles.cover}>{detailCover && !coverFailed ? <img src={detailCover} alt={`Cover of ${book.title}`} onError={() => setCoverFailed(true)} /> : <div className={styles.coverFallback} aria-label={`Cover unavailable for ${book.title}`} role="img"><span>{book.category || 'A folio book'}</span><strong>{book.title}</strong><small>{book.author}</small></div>}</div>
    <div className={styles.info}><p className="eyebrow">{book.provider === 'googlebooks' ? 'Google Books' : 'Open Library'}</p><h1>{book.title}</h1><p className={styles.author}>by {book.authors?.length ? book.authors.join(', ') : book.author}</p>{description && <p className={styles.description}>{description}</p>}
      {purchasable
        ? <div className={styles.purchase}><p className={styles.price}>{formatPrice(book.storeProduct.price, book.storeProduct.currency)}</p><p className={styles.availability}>{stockLabel(book.storeProduct.stockStatus)}</p>{book.storeProduct.available && <button className={styles.add} type="button" disabled={cartState.busy} onClick={addBookToCart}>{cartState.busy ? 'Adding…' : 'Add to cart'} <span aria-hidden="true">↗</span></button>}</div>
        : <p className={styles.availability}>This is a discovery result and is not currently sold by folio.</p>}
      {cartState.message && <p className={styles.success} role="status">{cartState.message} <Link to="/cart">View cart</Link></p>}
      {cartState.error && <p className={styles.error} role="alert">{cartState.error}{/sign in/i.test(cartState.error) && <> <Link to="/login">Sign in</Link></>}</p>}
      {book.previewUrl && <a className={styles.preview} href={book.previewUrl} target="_blank" rel="noreferrer">Preview on Google Books <span aria-hidden="true">↗</span></a>}
      {readable ? <a className={styles.add} href={book.reading.url} target="_blank" rel="noreferrer">{book.reading.status === 'lendable' ? 'Borrow from Open Library' : 'Read on Open Library'} <span aria-hidden="true">↗</span></a> : <p className={styles.availability}>{readingMessage}</p>}
      {book.provider === 'openlibrary' && <p className={styles.availability}>Reading status: {book.reading?.status || 'No readable edition identified'}</p>}
      <dl className={styles.facts}>{book.isbns?.length ? <div><dt>ISBNs</dt><dd>{book.isbns.join(', ')}</dd></div> : book.isbn && <div><dt>ISBN</dt><dd>{book.isbn}</dd></div>}{book.firstPublishYear && <div><dt>First published</dt><dd>{book.firstPublishYear}</dd></div>}{book.publicationDate && <div><dt>Publication date</dt><dd>{book.publicationDate}</dd></div>}{book.publishDates?.length > 0 && <div><dt>Publication dates</dt><dd>{book.publishDates.join(', ')}</dd></div>}{book.publishers?.length > 0 && <div><dt>Publishers</dt><dd>{book.publishers.join(', ')}</dd></div>}{book.pageCount && <div><dt>Pages</dt><dd>{book.pageCount}</dd></div>}{book.subjects?.length > 0 && <div><dt>Subjects</dt><dd>{book.subjects.join(', ')}</dd></div>}{book.identifiers?.googleBooksVolumeId && <div><dt>Google ID</dt><dd>{book.identifiers.googleBooksVolumeId}</dd></div>}{book.identifiers?.openLibraryWorkId && <div><dt>Open Library ID</dt><dd>{book.identifiers.openLibraryWorkId}</dd></div>}<div><dt>Source</dt><dd><a href={book.sourceUrl} target="_blank" rel="noreferrer">{book.provider === 'googlebooks' ? 'Google Books record' : 'Open Library record'}</a></dd></div></dl>
    </div>
  </div>
    {hasOpenLibraryReviews(bookId) && <section className={styles.reviews} aria-labelledby="reviews-title">
      <p className="eyebrow">Reader notes</p><h2 id="reviews-title">Reviews</h2>
      {reviews.status === 'loading' && <p aria-live="polite">Loading reviews…</p>}
      {reviews.status === 'error' && <p role="alert">{reviews.message}</p>}
      {reviews.status === 'ready' && <>
        <p className={styles.availability}>{reviews.count ? `${reviews.average.toFixed(1)} out of 5 · ${reviews.count} ${reviews.count === 1 ? 'review' : 'reviews'}` : 'No reviews yet.'}</p>
        {reviews.items.map(item => <article className={styles.review} key={item.id}><h3>{item.author}</h3><p className={styles.availability}>{item.rating} out of 5 · {new Date(item.createdAt).toLocaleDateString()}</p><p>{item.content}</p>{item.mine && <><button type="button" onClick={() => { setEditingReview(item.id); setReview({ rating: String(item.rating), content: item.content }); }}>Edit your review</button>{' '}<button type="button" onClick={() => deleteReview(item.id)}>Delete your review</button></>}</article>)}
      </>}
      <form className={styles.reviewForm} onSubmit={submitReview}>
        <label htmlFor="review-rating">Your rating</label><select id="review-rating" value={review.rating} onChange={event => setReview(current => ({ ...current, rating: event.target.value }))}>{[5,4,3,2,1].map(value => <option key={value} value={value}>{value} out of 5</option>)}</select>
        <label htmlFor="review-content">Your review</label><textarea id="review-content" minLength={10} maxLength={2000} required value={review.content} onChange={event => setReview(current => ({ ...current, content: event.target.value }))} />
        <button className={styles.add} type="submit" disabled={reviewBusy || review.content.trim().length < 10}>{reviewBusy ? 'Submitting…' : editingReview ? 'Save review' : 'Submit review'}</button>
        {reviews.message && <p role="alert" className={styles.error}>{reviews.message}</p>}
      </form>
    </section>}
  </article>;
}
