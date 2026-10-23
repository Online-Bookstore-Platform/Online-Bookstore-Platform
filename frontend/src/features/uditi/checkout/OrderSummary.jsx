import { Link } from 'react-router-dom';
import { formatPrice, pluralize } from '../shared/format.js';
import styles from './Checkout.module.css';

const hasText = value => typeof value === 'string' && value.trim() !== '';

/**
 * The order summary: books, quantities, prices (as re-read from the database), totals,
 * and where the order will go. `action` is the submit area, kept next to the total.
 */
export default function OrderSummary({ summary, delivery, children }) {
  const { items, totals, itemCount } = summary;
  const currency = totals.currency;
  const addressParts = [delivery.addressLine1, delivery.addressLine2, [delivery.city, delivery.state].filter(hasText).join(', '), [delivery.postalCode, delivery.country].filter(hasText).join(' ')].filter(hasText);

  return (
    <aside className={styles.summary} aria-labelledby="summary-heading">
      <div className={styles.summaryHead}>
        <h2 id="summary-heading">Order summary</h2>
        <Link to="/cart">Edit cart</Link>
      </div>
      <p className={styles.count}>{pluralize(itemCount, 'book', 'books')}</p>

      <ul className={styles.lines}>
        {items.map(item => (
          <li key={item.bookId} className={item.problem ? styles.lineProblem : undefined}>
            <div className={styles.lineMain}>
              <p className={styles.lineTitle}>
                {item.title ? <Link to={`/books/${item.bookId}`}>{item.title}</Link> : 'A book that is no longer listed'}
              </p>
              {item.author && <p className={styles.lineMeta}>{item.author}</p>}
              <p className={styles.lineMeta}>{item.quantity} × {formatPrice(item.unitPrice, currency)}</p>
              {item.problem && <p className={styles.problem}>{item.problem}</p>}
            </div>
            <p className={styles.lineTotal}>{formatPrice(item.lineTotal, currency)}</p>
          </li>
        ))}
      </ul>

      <dl className={styles.totals}>
        <div><dt>Subtotal</dt><dd>{formatPrice(totals.subtotal, currency)}</dd></div>
        <div className={styles.grand}><dt>Total</dt><dd>{formatPrice(totals.total, currency)}</dd></div>
      </dl>

      {addressParts.length > 0 && (
        <div className={styles.deliverTo}>
          <h3>Delivering to</h3>
          {hasText(delivery.recipientName) && <p><strong>{delivery.recipientName}</strong></p>}
          {addressParts.map(part => <p key={part}>{part}</p>)}
          {hasText(delivery.phone) && <p>{delivery.phone}</p>}
        </div>
      )}

      {children}
    </aside>
  );
}
