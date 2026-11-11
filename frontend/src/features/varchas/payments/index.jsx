import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest, getCurrentUser } from '../api.js';
import { fetchSummary } from '../../uditi/checkout/api.js';
import { getOrder } from '../../vrinda/api.js';
import styles from './Payment.module.css';

const money = (amount, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount) || 0);
const methods = {
  card: { name: 'Credit or debit card', icon: '▰' },
  upi: { name: 'UPI', icon: '◇' },
  netbanking: { name: 'Net banking', icon: '▦' },
};

export default function PaymentPage() {
  const [query, setQuery] = useSearchParams();
  const orderId = query.get('orderId') || '';
  const paymentMethod = query.get('method') || 'card';
  const savedChallengeId = query.get('challengeId') || '';
  const [checkout, setCheckout] = useState(null);
  const [user, setUser] = useState(null);
  const [order, setOrder] = useState(null);
  const [challengeId, setChallengeId] = useState(savedChallengeId);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    if (orderId) {
      getOrder(orderId, controller.signal)
        .then(result => setOrder(result))
        .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
        .finally(() => setLoading(false));
    } else {
      Promise.all([fetchSummary(controller.signal), getCurrentUser()])
        .then(([summary, current]) => { setCheckout(summary); setUser(current.user); })
        .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
        .finally(() => setLoading(false));
    }
    return () => controller.abort();
  }, [orderId]);

  async function requestCode() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await apiRequest('/api/payments/otp', { method: 'POST', body: JSON.stringify({ paymentMethod }) });
      const id = result.challenge.challengeId;
      setChallengeId(id);
      setResendAt(Date.parse(result.challenge.resendAt));
      setOtp('');
      setQuery({ method: paymentMethod, challengeId: id }, { replace: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function verify(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await apiRequest('/api/payments/otp/verify', { method: 'POST', body: JSON.stringify({ challengeId, otp }) });
      setOrder(result.order);
      setChallengeId('');
      setQuery({ orderId: String(result.order.id) }, { replace: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const isSuccess = order?.paymentStatus === 'succeeded';
  const summaryItems = order?.items || checkout?.items || [];
  const subtotal = order?.totalAmount ?? checkout?.totals?.total ?? 0;
  const currency = order?.currency || checkout?.totals?.currency || 'INR';
  const method = methods[order?.paymentMethod || paymentMethod] || methods.card;
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  if (loading) return <section className={styles.page}><div className={styles.panel}><p className="eyebrow">Checkout</p><h1>Preparing your order…</h1></div></section>;
  if (error && !checkout && !order) return <section className={styles.page}><div className={styles.panel}><h1>We could not load checkout.</h1><p role="alert">{error}</p><Link to="/cart">Return to cart</Link></div></section>;

  return <section className={styles.page}><div className={styles.panel}>
    <nav className={styles.progress} aria-label="Checkout progress"><span>Cart</span><i /><span>Delivery</span><i /><strong>Payment</strong><i /><span>Confirmation</span></nav>
    <p className="eyebrow">Secure checkout</p>
    <h1>{isSuccess ? 'Your order is confirmed.' : challengeId ? 'Verify your email.' : 'Review and continue.'}</h1>
    <p className={styles.copy}>{isSuccess
      ? 'Your email code has been verified and your order is confirmed.'
      : 'Confirm your order with a six-digit code sent to your registered email address.'}</p>

    <div className={styles.checkoutGrid}><div className={styles.mainColumn}>
      {isSuccess ? <section className={`${styles.status} ${styles.success}`} role="status"><span className={styles.indicator} /><div><strong>Order confirmed</strong><p>Payment verification is complete for order {order.orderNumber}.</p><Link to={`/orders/${encodeURIComponent(order.id)}`}>Track this order ↗</Link></div></section> : challengeId ? <form className={styles.paymentForm} onSubmit={verify}>
        <div className={styles.methodHead}><span className={styles.methodIcon} aria-hidden="true">✉</span><div><p className="eyebrow">Email verification</p><h2>Check your registered Gmail</h2></div></div>
        <p className={styles.helper}>We sent a six-digit code to <strong>{user?.email || 'your registered email'}</strong>. It expires in five minutes and can be used once.</p>
        <label htmlFor="payment-otp">Verification code<input id="payment-otp" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required aria-describedby="otp-hint" /></label>
        <small id="otp-hint" className={styles.helper}>Enter the code from Folio. Do not share it with anyone.</small>
        {error && <p className={styles.inlineError} role="alert">{error}</p>}
        <button className={styles.submit} type="submit" disabled={busy || otp.length !== 6}>{busy ? 'Verifying code…' : 'Verify and confirm order'} <span aria-hidden="true">↗</span></button>
        <button className={styles.resend} type="button" onClick={requestCode} disabled={busy || resendSeconds > 0}>{resendSeconds > 0 ? `Send a new code in ${resendSeconds}s` : 'Send a new code'}</button>
      </form> : <section className={styles.paymentForm}>
        <div className={styles.methodHead}><span className={styles.methodIcon} aria-hidden="true">{method.icon}</span><div><p className="eyebrow">Selected payment method</p><h2>{method.name}</h2></div></div>
        <p className={styles.helper}>A one-time code will be sent to {user?.email || 'your registered email address'} to verify and confirm your order.</p>
        {error && <p className={styles.inlineError} role="alert">{error}</p>}
        <button className={styles.submit} type="button" onClick={requestCode} disabled={busy}>{busy ? 'Sending verification code…' : `Send code · ${money(subtotal, currency)}`} <span aria-hidden="true">↗</span></button>
      </section>}
      <div className={styles.actions}>{isSuccess && <Link to={`/orders/${encodeURIComponent(order.id)}`}>View order details</Link>}<Link className={styles.secondary} to="/cart">Return to cart</Link></div>
    </div>

    <section className={styles.orderSummary} aria-label="Order summary"><h2>Order summary <span>{order?.orderNumber || 'Before confirmation'}</span></h2>
      <ul>{summaryItems.map(item => <li key={item.bookId}><div className={styles.orderBook}>{item.coverImageUrl && <img src={item.coverImageUrl} alt={`Cover of ${item.title}`} />}<div><strong>{item.title}</strong><small>Qty {item.quantity} · {money(item.unitPrice, currency)} each</small></div></div><strong>{money(item.lineTotal, currency)}</strong></li>)}</ul>
      <dl className={styles.totals}><div><dt>Subtotal</dt><dd>{money(subtotal, currency)}</dd></div><div><dt>Delivery</dt><dd>{money(0, currency)}</dd></div><div className={styles.orderTotal}><dt>Total</dt><dd>{money(subtotal, currency)}</dd></div></dl>
      <p className={styles.disclaimer}>{isSuccess ? `Payment verification: complete. Order ID: ${order.orderNumber}.` : 'Your order is confirmed after you verify the code sent to your email.'}</p>
    </section></div>
  </div></section>;
}
