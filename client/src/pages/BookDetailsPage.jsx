import { Link, useNavigate, useParams } from 'react-router-dom';
import BookCover from '../components/BookCover.jsx';
import ErrorState from '../components/ErrorState.jsx';
import StockNote from '../components/StockNote.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatPrice } from '../utils/format.js';

export default function BookDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { status, data, error, reload } = useApi(`/books/${encodeURIComponent(id)}`);
  const book = data?.data;

  // "Back to results" returns to the exact search/filters the person came from.
  const cameFromCatalogue = window.history.state?.idx > 0;
  function goBack(event) {
    if (cameFromCatalogue) {
      event.preventDefault();
      navigate(-1);
    }
  }

  if (status === 'error') {
    const missing = error.status === 404;
    return (
      <main className="details">
        <ErrorState
          title={missing ? 'We could not find that book' : 'We could not load this book'}
          message={missing ? 'It may have been removed from the catalogue.' : error.message}
          onRetry={missing ? undefined : reload}
        />
        <Link to="/" className="back-link">
          Back to all books
        </Link>
      </main>
    );
  }

  if (!book) {
    return (
      <main className="details" aria-busy="true">
        <p className="muted">Loading book…</p>
      </main>
    );
  }

  return (
    <main className="details">
      <Link to="/" className="back-link" onClick={goBack}>
        Back to results
      </Link>

      <article className="details__layout">
        <div className="details__cover">
          <BookCover book={book} />
        </div>

        <div className="details__body">
          <h1 className="details__title">{book.title}</h1>
          <p className="details__author">
            by <Link to={`/?author=${encodeURIComponent(book.author)}`}>{book.author}</Link>
          </p>

          <p className="details__price">
            {formatPrice(book.price)} <StockNote status={book.stockStatus} />
          </p>

          {book.description && <p className="details__description">{book.description}</p>}

          <dl className="facts">
            <div>
              <dt>Category</dt>
              <dd>
                <Link to={`/?category=${book.category.id}`}>{book.category.name}</Link>
              </dd>
            </div>
            <div>
              <dt>ISBN</dt>
              <dd>{book.isbn}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>{book.inStock ? (book.stockStatus === 'low_stock' ? 'In stock, few copies left' : 'In stock') : 'Out of stock'}</dd>
            </div>
          </dl>
        </div>
      </article>
    </main>
  );
}
