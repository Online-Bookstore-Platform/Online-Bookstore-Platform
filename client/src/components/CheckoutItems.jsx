import { Link } from 'react-router-dom';
import BookCover from './BookCover.jsx';
import { CART_PATH } from '../config.js';
import { formatPrice, pluralise } from '../utils/format.js';

/** The books in the cart, with a plain-language note on any that cannot be bought as chosen. */
export default function CheckoutItems({ items, hasProblems }) {
  return (
    <>
      {hasProblems && (
        <p className="form-banner" role="alert">
          Some books can no longer be bought as chosen. Please update your cart to continue.
        </p>
      )}
      <ul className="checkout-items">
        {items.map((item) => (
          <li key={item.bookId} className={`checkout-item${item.available ? '' : ' checkout-item--problem'}`}>
            <div className="checkout-item__cover">
              <BookCover book={{ id: item.bookId, title: item.title, author: item.author, category: item.category }} />
            </div>
            <div className="checkout-item__body">
              <h3 className="checkout-item__title">
                <Link to={`/books/${item.bookId}`}>{item.title}</Link>
              </h3>
              <p className="checkout-item__author">{item.author}</p>
              <p className="checkout-item__qty">
                {pluralise(item.quantity, 'copy', 'copies')} × {formatPrice(item.unitPrice)}
              </p>
              {item.problem && <p className="checkout-item__problem">{item.problem}</p>}
            </div>
            <p className="checkout-item__total">{formatPrice(item.lineTotal)}</p>
          </li>
        ))}
      </ul>
      <p className="checkout-edit">
        <Link to={CART_PATH}>Edit cart</Link>
      </p>
    </>
  );
}
