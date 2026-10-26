import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api.js';
import { getOrder } from '../../vrinda/api.js';
import styles from './Payment.module.css';

const methodNames = { card: 'Credit or debit card', upi: 'UPI', netbanking: 'Net banking', cod: 'Cash on delivery' };
const money = (amount, currency = 'INR') => {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount) || 0); }
  catch { return `${currency} ${Number(amount) || 0}`; }
};

export default function PaymentPage() {
  const [query] = useSearchParams();
  const orderId = query.get('orderId') || '';
  const [order, setOrder] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState({ cardholder: '', upiId: '', bank: '' });
  const [key, setKey] = useState('');

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    const controller = new AbortController();
    getOrder(orderId, controller.signal)
      .then(setOrder)
      .catch(requestError => { if (requestError.name !== 'AbortError') setError(requestError.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [orderId]);

  function validateDetails() {
    if (order?.paymentMethod === 'card' && !/^[\p{L}][\p{L} .'-]{1,79}$/u.test(details.cardholder.trim())) {
      return 'Enter the cardholder name to continue.';
    }
    if (order?.paymentMethod === 'upi' && !/^[\w.-]{2,40}@(folio|example)$/i.test(details.upiId.trim())) {
      return 'Enter a sample UPI ID ending in @folio or @example.';
    }
    if (order?.paymentMethod === 'netbanking' && !details.bank) return 'Choose your bank to continue.';
    return '';
  }

  async function pay(event) {
    event.preventDefault();
    if (busy) return;
    const validationMessage = validateDetails();
    if (validationMessage) { setError(validationMessage); return; }
    if (!/^[\w-]{1,64}$/.test(orderId)) { setError('A valid order ID is required to continue.'); return; }

    setBusy(true);
    setError('');
    const storageKey = `folio.payment-idempotency-${orderId}`;
    const idempotencyKey = key || sessionStorage.getItem(storageKey) || crypto.randomUUID();
    setKey(idempotencyKey);
    sessionStorage.setItem(storageKey, idempotencyKey);
    try {
      const result = await apiRequest(`/api/payments/orders/${encodeURIComponent(orderId)}`, {
        method: 'POST', headers: { 'Idempotency-Key': idempotencyKey },
      });
      setAttempt(result.attempt);
      if (result.attempt.status !== 'pending') sessionStorage.removeItem(storageKey);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!attempt?.id || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest(`/api/payments/${encodeURIComponent(attempt.id)}/cancel`, { method: 'POST' });
      setAttempt(result.attempt);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function retry() {
    setKey('');
    sessionStorage.removeItem(`folio.payment-idempotency-${orderId}`);
    setAttempt(null);
    setError('');
  }

  if (loading) return <section className={styles.page} aria-live="polite"><div className={styles.panel}><p className="eyebrow">Checkout</p><h1>Preparing your order…</h1></div></section>;

  const cod = order?.paymentMethod === 'cod';
  const canPay = order && !cod && ['card', 'upi', 'netbanking'].includes(order.paymentMethod);
  const successful = attempt?.status === 'succeeded';
  const terminal = ['failed', 'timed_out', 'cancelled'].includes(attempt?.status);

  return <section className={styles.page}><div className={styles.panel}>
    <p className="eyebrow">Checkout</p>
    <h1>{successful ? 'Your order is confirmed.' : 'Complete your order.'}</h1>
    <p className={styles.copy}>Review your books and order total before continuing.</p>

    {order && <section className={styles.orderSummary} aria-label="Order summary">
      <h2>Order summary <span>{order.orderNumber}</span></h2>
      <ul>{(order.items || []).map(item => <li key={item.bookId}>
        <div className={styles.orderBook}>
          {item.coverImageUrl && <img src={item.coverImageUrl} alt={`Cover of ${item.title}`} loading="lazy" onError={event => { event.currentTarget.hidden = true; }} />}
          <span className={styles.coverFallback} aria-hidden="true">folio.</span>
          <div><strong>{item.title}</strong><small>Qty {item.quantity} · {money(item.unitPrice, order.currency)} each</small></div>
        </div>
        <strong>{money(item.lineTotal, order.currency)}</strong>
      </li>)}</ul>
      <p className={styles.orderTotal}><span>Order total</span><strong>{money(order.totalAmount, order.currency)}</strong></p>
    </section>}

    {cod && <div className={styles.notice} role="status">Your order is placed. Payment is due when your books are delivered.</div>}
    {!order && <div className={styles.error} role="alert">{error || 'We could not load this order.'}</div>}

    {canPay && !successful && !terminal && <form className={styles.paymentForm} onSubmit={pay}>
      <h2>{methodNames[order.paymentMethod]}</h2>
      {order.paymentMethod === 'card' && <label>Cardholder name
        <input autoComplete="name" maxLength={80} value={details.cardholder} onChange={event => setDetails(current => ({ ...current, cardholder: event.target.value }))} />
        <small>Your card number and security code are not requested.</small>
      </label>}
      {order.paymentMethod === 'upi' && <label>UPI ID
        <input autoComplete="off" placeholder="reader@folio" maxLength={50} value={details.upiId} onChange={event => setDetails(current => ({ ...current, upiId: event.target.value }))} />
        <small>Use a sample ID ending in @folio or @example.</small>
      </label>}
      {order.paymentMethod === 'netbanking' && <label>Choose your bank
        <select value={details.bank} onChange={event => setDetails(current => ({ ...current, bank: event.target.value }))}>
          <option value="">Select a bank</option><option value="sbi">State Bank of India</option><option value="hdfc">HDFC Bank</option><option value="icici">ICICI Bank</option><option value="axis">Axis Bank</option>
        </select>
        <small>Bank passwords and one-time PINs are never requested.</small>
      </label>}
      <p className={styles.amountDue}>Order total <strong>{money(order.totalAmount, order.currency)}</strong></p>
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? 'Processing your order…' : 'Place order'} <span aria-hidden="true">↗</span></button>
    </form>}

    {attempt && <div className={`${styles.status} ${successful ? styles.success : terminal ? styles.failure : ''}`} role="status">
      <span className={styles.indicator} aria-hidden="true" />
      <div>
        <strong>{successful ? 'Order confirmed' : attempt.status === 'pending' ? 'Processing your order' : 'Checkout not completed'}</strong>
        <p>{successful ? 'Your order is confirmed. No money was collected.' : attempt.status === 'pending' ? 'Please wait while we finish preparing your order.' : attempt.status === 'timed_out' ? 'We could not finish this checkout. You can safely try again.' : attempt.status === 'cancelled' ? 'Checkout was cancelled. Your order remains unpaid.' : 'We could not complete this checkout. Your order remains unpaid.'}</p>
      </div>
    </div>}
    {error && order && <p className={styles.error} role="alert">{error}</p>}

    <div className={styles.actions}>
      {cod && <Link to={`/orders/${encodeURIComponent(order.id)}`}>View order status <span aria-hidden="true">↗</span></Link>}
      {successful && <Link to={`/orders/${encodeURIComponent(orderId)}`}>View order status <span aria-hidden="true">↗</span></Link>}
      {attempt?.status === 'pending' && <button type="button" onClick={cancel} disabled={busy}>Cancel checkout</button>}
      {terminal && <button type="button" onClick={retry} disabled={busy}>Try again</button>}
      <Link className={styles.secondary} to="/catalogue">Back to the bookstore</Link>
    </div>
    {!cod && canPay && <p className={styles.disclaimer}>Never enter your card number, security code, UPI PIN, or bank password on this page.</p>}
  </div></section>;
}
