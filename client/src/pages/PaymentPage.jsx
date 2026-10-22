import { Link } from 'react-router-dom';

// PLACEHOLDER for issue #8 (Payment Processing and Verification). Checkout hands over
// to PAYMENT_PATH (config.js); replace this page with the real payment step.
export default function PaymentPage() {
  return (
    <main className="checkout">
      <div className="state">
        <h1 className="state__title">Payment is not available yet</h1>
        <p className="state__text">Your order and delivery details are ready. Online payment is coming soon.</p>
        <Link to="/checkout" className="btn btn--outline">
          Back to checkout
        </Link>
      </div>
    </main>
  );
}
