import { Link } from 'react-router-dom';
import BookCover from './BookCover.jsx';
import StockNote from './StockNote.jsx';
import { formatPrice } from '../utils/format.js';

export default function BookCard({ book }) {
  return (
    <li className={`book${book.inStock ? '' : ' book--out'}`}>
      <Link to={`/books/${book.id}`} className="book__link">
        <BookCover book={book} />
        <h3 className="book__title">{book.title}</h3>
        <p className="book__author">{book.author}</p>
        <p className="book__meta">
          <span className="book__price">{formatPrice(book.price)}</span>
          <StockNote status={book.stockStatus} />
        </p>
      </Link>
    </li>
  );
}
