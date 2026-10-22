import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet } from '../api.js';
import CheckoutItems from '../components/CheckoutItems.jsx';
import DeliveryForm from '../components/DeliveryForm.jsx';
import ErrorState from '../components/ErrorState.jsx';
import OrderSummary from '../components/OrderSummary.jsx';
import { PAYMENT_PATH } from '../config.js';
import { useApi } from '../hooks/useApi.js';
import { addressLines } from '../utils/delivery.js';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { status, data, error, reload } = useApi('/checkout');
  const [editing, setEditing] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [notice, setNotice] = useState('');
  const summary = data?.data;

  if (status === 'error' && !summary) {
    const signedOut = error.status === 401;
    return (
      <main className="checkout">
        <ErrorState
          title={signedOut ? 'Please sign in to check out' : 'We could not load your checkout'}
          message={error.message}
          onRetry={signedOut ? undefined : reload}
        />
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="checkout" aria-busy="true">
        <p className="muted">Loading your checkout…</p>
      </main>
    );
  }

  if (summary.items.length === 0) {
    return (
      <main className="checkout">
        <div className="state">
          <h1 className="state__title">Your cart is empty</h1>
          <p className="state__text">Add a book to your cart to check out.</p>
          <Link to="/" className="btn">
            Browse books
          </Link>
        </div>
      </main>
    );
  }

  const showForm = editing || !summary.delivery;

  function deliverySaved() {
    setEditing(false);
    setNotice('');
    reload();
  }

  async function continueToPayment() {
    setContinuing(true);
    setNotice('');
    try {
      // Stock and prices can change while the page is open: look again before paying.
      const fresh = (await apiGet('/checkout')).data;
      if (fresh.canProceed) {
        navigate(PAYMENT_PATH);
        return;
      }
      setNotice('Something changed in your order. Please review it below before continuing.');
      reload();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setContinuing(false);
    }
  }

  return (
    <main className="checkout">
      <h1 className="page-title">Checkout</h1>

      <div className="checkout__layout">
        <div className="checkout__steps">
          <section className="checkout-section" aria-labelledby="step-items">
            <h2 id="step-items" className="checkout-section__title">
              Review your items
            </h2>
            <CheckoutItems items={summary.items} hasProblems={!summary.stock.ok} />
          </section>

          <section className="checkout-section" aria-labelledby="step-delivery">
            <h2 id="step-delivery" className="checkout-section__title">
              Delivery details
            </h2>
            {showForm ? (
              <DeliveryForm
                key={summary.delivery ? 'edit' : 'new'}
                initial={summary.delivery}
                suggestion={summary.suggestedDelivery}
                onSaved={deliverySaved}
                onCancel={summary.delivery ? () => setEditing(false) : undefined}
              />
            ) : (
              <div className="delivery-saved">
                <address>
                  <strong>{summary.delivery.recipientName}</strong>
                  {addressLines(summary.delivery).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                  <span>{summary.delivery.phone}</span>
                </address>
                <button type="button" className="link-button" onClick={() => setEditing(true)}>
                  Change delivery details
                </button>
              </div>
            )}
          </section>
        </div>

        <OrderSummary summary={summary} onContinue={continueToPayment} continuing={continuing} notice={notice} />
      </div>
    </main>
  );
}
