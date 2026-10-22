import { useState } from 'react';
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

  async function pay() {
    if (!/^[\w-]{1,64}$/.test(orderId)) { setError('A valid order ID is required to continue.'); return; }
    setBusy(true);
    setError('');
    const idempotencyKey = key || crypto.randomUUID();
    setKey(idempotencyKey);
    try {
      const result = await apiRequest(`/api/payments/orders/${encodeURIComponent(orderId)}`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } });
      setAttempt({ ...result.attempt, providerMode: result.providerMode });
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
    setAttempt(null);
    setError('');
  }

  const statusCopy = { succeeded: attempt?.providerMode === 'mock' ? 'The configured mock sandbox approved this attempt. No real payment was made.' : 'Payment verified.', failed: 'The payment was declined. Your order remains unpaid.', cancelled: 'This payment attempt was cancelled.', timed_out: 'The provider did not respond in time. Check the attempt status before trying again.', pending: 'Your payment is being processed.' };

  return <section className={styles.page}><div className={styles.panel}><p className="eyebrow">Payment · Story #8</p><h1>Complete your order.</h1><p className={styles.copy}>Your payment is verified by the server. Card details are never entered or stored on this page.</p>
    {!orderId && <p className={styles.notice} role="status">This page needs an order ID. Return to checkout to continue.</p>}
    {attempt && <div className={styles.status} role="status"><span className={`${styles.indicator} ${styles[attempt.status] || ''}`} /> <div><strong>{attempt.status?.replaceAll('_', ' ') || 'Payment status'}</strong><p>{statusCopy[attempt.status] || 'The server recorded this payment attempt.'}</p>{attempt.providerMode === 'mock' && <small>Mock sandbox mode</small>}</div></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>{!attempt && <button type="button" onClick={pay} disabled={busy || !orderId}>{busy ? 'Contacting provider…' : 'Continue to payment'} <span aria-hidden="true">↗</span></button>}
      {attempt?.status === 'pending' && <button type="button" onClick={cancel} disabled={busy}>Cancel this attempt</button>}
      {['failed', 'timed_out', 'cancelled'].includes(attempt?.status) && <button type="button" onClick={retry} disabled={busy}>Start a new attempt</button>}
      {attempt?.status === 'succeeded' && <Link to={`/orders/${encodeURIComponent(orderId)}`}>View order status <span aria-hidden="true">↗</span></Link>}
      <Link className={styles.secondary} to="/catalogue">Back to the bookstore</Link>
    </div>
    <p className={styles.disclaimer}>Payments are unavailable until the order service and a sandbox provider are configured.</p>
  </div></section>;
}
