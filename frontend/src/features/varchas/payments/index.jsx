import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api.js';
import styles from './Payment.module.css';

export default function PaymentPage() {
  const [query] = useSearchParams();
  const orderId = query.get('orderId') || '';
  const [attempt, setAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [key, setKey] = useState('');
  const [method, setMethod] = useState('loading');

  useEffect(() => {
    apiRequest('/api/payments/method').then(result => setMethod(result.mode)).catch(requestError => {
      setMethod('unconfigured');
      setError(requestError.message);
    });
  }, []);

  async function loadRazorpay() {
    if (window.Razorpay) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
      document.body.appendChild(script);
    });
  }

  async function pay() {
    if (!/^[\w-]{1,64}$/.test(orderId)) { setError('A valid order ID is required to continue.'); return; }
    setBusy(true);
    setError('');
    const storageKey = `folio.payment-idempotency-${orderId}`;
    const idempotencyKey = key || sessionStorage.getItem(storageKey) || crypto.randomUUID();
    setKey(idempotencyKey);
    sessionStorage.setItem(storageKey, idempotencyKey);
    try {
      const result = await apiRequest(`/api/payments/orders/${encodeURIComponent(orderId)}`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } });
      setAttempt({ ...result.attempt, providerMode: result.providerMode });
      if (result.providerMode === 'razorpay') {
        await loadRazorpay();
        const checkout = new window.Razorpay({
          key: result.providerKeyId, order_id: result.providerOrderId,
          amount: Math.round(Number(result.attempt.amount) * 100), currency: result.attempt.currency,
          name: 'folio.', description: 'Book order',
          handler: async response => {
            try {
              const verified = await apiRequest(`/api/payments/${encodeURIComponent(result.attempt.id)}/verify`, { method: 'POST', body: JSON.stringify(response) });
              setAttempt(current => ({ ...current, ...verified.attempt, providerMode: 'razorpay' }));
            } catch (verificationError) { setError(verificationError.message); }
          },
        });
        checkout.open();
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!attempt?.id) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest(`/api/payments/${encodeURIComponent(attempt.id)}/cancel`, { method: 'POST' });
      setAttempt(current => ({ ...current, ...result.attempt }));
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function retry() {
    setKey('');
    sessionStorage.removeItem(`folio.payment-idempotency-${orderId}`);
    setAttempt(null);
    setError('');
  }

  const statusCopy = { succeeded: attempt?.providerMode === 'mock' ? 'Your order is confirmed. No real payment was processed.' : 'Payment verified by Folio.', failed: 'The payment was declined. Your order remains unpaid.', cancelled: 'This payment attempt was cancelled.', timed_out: 'The payment service did not respond in time. Check the attempt status before trying again.', pending: 'Your payment is being processed.' };

  return <section className={styles.page}><div className={styles.panel}><p className="eyebrow">Payment · Story #8</p><h1>Complete your order.</h1><p className={styles.copy}>Your payment is verified by the server. Card details are never entered or stored on this page.</p>
    {method === 'mock' && <fieldset className={styles.method}><legend>Payment method</legend><label><input type="radio" name="paymentMethod" checked onChange={() => {}} /><span><strong>Payment method</strong><small>No real payment will be processed.</small></span></label></fieldset>}
    {method === 'razorpay' && <fieldset className={styles.method}><legend>Payment method</legend><label><input type="radio" name="paymentMethod" checked onChange={() => {}} /><span><strong>Card payment</strong><small>Folio does not receive or store card details.</small></span></label></fieldset>}
    {method === 'unconfigured' && <div className={styles.notice} role="status"><strong>Payment is not configured.</strong><span>Ask the project administrator to enable a payment method.</span></div>}
    {!orderId && <p className={styles.notice} role="status">This page needs an order ID. Return to checkout to continue.</p>}
    {attempt && <div className={styles.status} role="status"><span className={`${styles.indicator} ${styles[attempt.status] || ''}`} /> <div><strong>{attempt.status === 'succeeded' ? 'Order confirmed' : attempt.status?.replaceAll('_', ' ') || 'Payment status'}</strong><p>{statusCopy[attempt.status] || 'Your payment status has been recorded.'}</p></div></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>{(!attempt || attempt.status === 'pending') && <button type="button" onClick={pay} disabled={busy || !orderId || method === 'loading' || method === 'unconfigured'}>{busy ? 'Processing…' : attempt ? 'Continue payment' : 'Proceed to payment'} <span aria-hidden="true">↗</span></button>}
      {attempt?.status === 'pending' && <button type="button" onClick={cancel} disabled={busy}>Cancel this attempt</button>}
      {['failed', 'timed_out', 'cancelled'].includes(attempt?.status) && <button type="button" onClick={retry} disabled={busy}>Start a new attempt</button>}
      {attempt?.status === 'succeeded' && <Link to={`/orders/${encodeURIComponent(orderId)}`}>View order status <span aria-hidden="true">↗</span></Link>}
      <Link className={styles.secondary} to="/catalogue">Back to the bookstore</Link>
    </div>
    <p className={styles.disclaimer}>Card details are entered only in Razorpay Checkout. Folio verifies the provider response on the server.</p>
  </div></section>;
}
