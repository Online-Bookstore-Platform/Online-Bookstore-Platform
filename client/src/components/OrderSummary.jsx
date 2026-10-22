import { addressLines } from '../utils/delivery.js';
import { formatPrice, pluralise } from '../utils/format.js';

/** Order summary: totals, delivery address, and the button that moves on to payment. */
export default function OrderSummary({ summary, onContinue, continuing, notice }) {
  const { itemCount, totals, delivery, canProceed, stock } = summary;

  let reason = '';
  if (!stock.ok) reason = 'Update the books marked in your cart to continue.';
  else if (!delivery) reason = 'Add your delivery details to continue.';

  return (
    <aside className="order-summary" aria-labelledby="order-summary-title">
      <h2 id="order-summary-title" className="order-summary__title">
        Order summary
      </h2>

      <dl className="order-summary__rows">
        <div>
          <dt>Items ({pluralise(itemCount, 'copy', 'copies')})</dt>
          <dd>{formatPrice(totals.subtotal)}</dd>
        </div>
        <div className="order-summary__total">
          <dt>Total</dt>
          <dd>{formatPrice(totals.total)}</dd>
        </div>
      </dl>

      <div className="order-summary__address">
        <h3>Deliver to</h3>
        {delivery ? (
          <address>
            <strong>{delivery.recipientName}</strong>
            {addressLines(delivery).map((line) => (
              <span key={line}>{line}</span>
            ))}
            <span>{delivery.phone}</span>
          </address>
        ) : (
          <p className="muted">No delivery details yet.</p>
        )}
      </div>

      {notice && (
        <p className="form-banner" role="alert">
          {notice}
        </p>
      )}

      <button type="button" className="btn order-summary__cta" disabled={!canProceed || continuing} onClick={onContinue}>
        {continuing ? 'Checking your order…' : 'Continue to payment'}
      </button>
      {reason && <p className="order-summary__reason">{reason}</p>}
    </aside>
  );
}
