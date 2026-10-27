import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api.js';
import { getOrder } from '../../vrinda/api.js';
import styles from './Payment.module.css';

const methodNames = { card: 'Credit or debit card', upi: 'UPI', netbanking: 'Net banking', cod: 'Cash on delivery' };
const banks = [['sbi', 'State Bank of India'], ['hdfc', 'HDFC Bank'], ['icici', 'ICICI Bank'], ['axis', 'Axis Bank'], ['kotak', 'Kotak Mahindra Bank'], ['idbi', 'IDBI Bank']];
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
  const [details, setDetails] = useState({ cardholder: '', upiId: '', bank: '', upiApp: 'folio' });
  const [bankQuery, setBankQuery] = useState('');
  const [key, setKey] = useState('');

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    const controller = new AbortController();
    getOrder(orderId, controller.signal).then(setOrder).catch(requestError => { if (requestError.name !== 'AbortError') setError(requestError.message); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [orderId]);

  useEffect(() => {
    if (attempt?.status !== 'pending' || !attempt.id) return undefined;
    let active = true;
    const poll = window.setInterval(() => {
      apiRequest(`/api/payments/${encodeURIComponent(attempt.id)}`)
        .then(result => { if (active) setAttempt(result.attempt); })
        .catch(requestError => { if (active) setError(requestError.message); });
    }, 2500);
    return () => { active = false; window.clearInterval(poll); };
  }, [attempt?.id, attempt?.status]);

  function validateDetails() {
    if (order?.paymentMethod === 'card' && !/^[\p{L}][\p{L} .'-]{1,79}$/u.test(details.cardholder.trim())) return 'Enter the cardholder name to continue.';
    if (order?.paymentMethod === 'upi' && !/^[\w.-]{2,40}@(folio|example)$/i.test(details.upiId.trim())) return 'Enter a sample UPI ID ending in @folio or @example.';
    if (order?.paymentMethod === 'netbanking' && !details.bank) return 'Choose your bank to continue.';
    return '';
  }

  async function pay(event) {
    event.preventDefault();
    if (busy) return;
    const validationMessage = validateDetails();
    if (validationMessage) { setError(validationMessage); return; }
    if (!/^[\w-]{1,64}$/.test(orderId)) { setError('A valid order ID is required to continue.'); return; }
    setBusy(true); setError('');
    const storageKey = `folio.payment-idempotency-${orderId}`;
    const idempotencyKey = key || sessionStorage.getItem(storageKey) || crypto.randomUUID();
    setKey(idempotencyKey); sessionStorage.setItem(storageKey, idempotencyKey);
    try {
      const result = await apiRequest(`/api/payments/orders/${encodeURIComponent(orderId)}`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } });
      setAttempt(result.attempt);
      if (result.attempt.status !== 'pending') sessionStorage.removeItem(storageKey);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!attempt?.id || busy) return;
    setBusy(true); setError('');
    try { const result = await apiRequest(`/api/payments/${encodeURIComponent(attempt.id)}/cancel`, { method: 'POST' }); setAttempt(result.attempt); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function retry() { setKey(''); sessionStorage.removeItem(`folio.payment-idempotency-${orderId}`); setAttempt(null); setError(''); }

  if (loading) return <section className={styles.page} aria-live="polite"><div className={styles.panel}><p className="eyebrow">Checkout</p><h1>Preparing your order…</h1></div></section>;

  const cod = order?.paymentMethod === 'cod';
  const canPay = order && !cod && ['card', 'upi', 'netbanking'].includes(order.paymentMethod);
  const successful = attempt?.status === 'succeeded';
  const terminal = ['failed', 'timed_out', 'cancelled'].includes(attempt?.status);
  const subtotal = (order?.items || []).reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0);
  const filteredBanks = banks.filter(([, name]) => name.toLowerCase().includes(bankQuery.trim().toLowerCase()));

  return <section className={styles.page}><div className={styles.panel}>
    <nav className={styles.progress} aria-label="Checkout progress"><span>Cart</span><i /> <span>Delivery</span><i /> <strong>Payment</strong><i /> <span>Confirmation</span></nav>
    <p className="eyebrow">Checkout</p><h1>{successful ? 'Your order is confirmed.' : 'Complete your order.'}</h1>
    <p className={styles.copy}>Review your selection and choose how you would like to complete this simulated checkout.</p>
    <div className={styles.checkoutGrid}>
      <div className={styles.mainColumn}>
        {canPay && !successful && !terminal && <form className={styles.paymentForm} onSubmit={pay}>
          <div className={styles.methodHead}><span className={styles.methodIcon} aria-hidden="true">{order.paymentMethod === 'card' ? '▤' : order.paymentMethod === 'upi' ? '↗' : '⌂'}</span><div><p className="eyebrow">Selected method</p><h2>{methodNames[order.paymentMethod]}</h2></div></div>
          {order.paymentMethod === 'card' && <>
            <div className={styles.cardPreview} aria-live="polite"><div className={styles.cardPreviewTop}><span>folio.</span><span>VISA&nbsp; · &nbsp;Mastercard</span></div><strong>{details.cardholder.trim() || 'Your name'}</strong><span className={styles.sampleNumber} aria-label="Sample card number">•••• &nbsp;•••• &nbsp;•••• &nbsp;4242</span><small>SIMULATED CHECKOUT · SAMPLE DISPLAY</small></div>
            <div className={styles.cardFields} aria-label="Card details are not collected"><span><b>Card number</b><small>Sample display only</small></span><span><b>Expiry</b><small>Not collected</small></span><span><b>Security code</b><small>Not collected</small></span></div>
            <label>Cardholder name<input autoComplete="name" maxLength={80} value={details.cardholder} onChange={event => setDetails(current => ({ ...current, cardholder: event.target.value }))} /><small>This name only updates the preview. Card number, expiry, and security code are not collected.</small></label>
          </>}
          {order.paymentMethod === 'upi' && <>
            <div className={styles.appChoices} role="group" aria-label="Select simulated UPI app">{[['folio','Folio Pay','F'],['gpay','Google Pay','G'],['phonepe','PhonePe','P'],['paytm','Paytm','₹']].map(([id, name, mark]) => <button key={id} type="button" aria-pressed={details.upiApp === id} className={details.upiApp === id ? styles.choiceSelected : ''} onClick={() => setDetails(current => ({ ...current, upiApp: id }))}><b>{mark}</b>{name}</button>)}</div>
            <label>Sample UPI ID<input autoComplete="off" placeholder="reader@folio" maxLength={50} value={details.upiId} onChange={event => setDetails(current => ({ ...current, upiId: event.target.value }))} /><small>Use a fictional ID ending in @folio or @example. No PIN is requested.</small></label>
          </>}
          {order.paymentMethod === 'netbanking' && <>
            <label>Find a bank<input type="search" placeholder="Search supported banks" value={bankQuery} onChange={event => setBankQuery(event.target.value)} /></label>
            <div className={styles.bankChoices} role="group" aria-label="Choose a simulated bank">{filteredBanks.map(([id, name]) => <button key={id} type="button" aria-pressed={details.bank === id} className={details.bank === id ? styles.choiceSelected : ''} onClick={() => setDetails(current => ({ ...current, bank: id }))}>{name}</button>)}{filteredBanks.length === 0 && <p>No banks match your search.</p>}</div>
            <p className={styles.helper}>The next step is simulated. Bank passwords and one-time PINs are never requested.</p>
          </>}
          {error && <p className={styles.inlineError} role="alert">{error}</p>}
          <button className={styles.submit} type="submit" disabled={busy}>{busy ? 'Processing securely…' : 'Continue with simulated checkout'} <span aria-hidden="true">↗</span></button>
        </form>}
        {cod && order && <section className={styles.codCard}><p className="eyebrow">Cash on delivery</p><h2>Pay when your books arrive.</h2><p>Your order is placed with payment still due at delivery. It will remain unpaid until collection.</p><Link to={`/orders/${encodeURIComponent(order.id)}`}>View order status <span aria-hidden="true">↗</span></Link></section>}
        {attempt && <div className={`${styles.status} ${successful ? styles.success : terminal ? styles.failure : ''}`} role="status" aria-live="polite"><span className={styles.indicator} aria-hidden="true" /><div><strong>{successful ? 'Order confirmed' : attempt.status === 'pending' ? 'Payment processing' : 'Checkout not completed'}</strong><p>{successful ? 'The simulated checkout succeeded. No money was collected.' : attempt.status === 'pending' ? 'Your checkout is processing. You can wait or cancel this attempt.' : attempt.status === 'timed_out' ? 'The checkout timed out. You can safely try again.' : attempt.status === 'cancelled' ? 'Checkout was cancelled. Your order remains unpaid.' : 'The simulated checkout was declined. Your order remains unpaid.'}</p></div></div>}
        {!order && <div className={styles.error} role="alert">{error || 'We could not load this order.'}</div>}
        {error && order && (!canPay || attempt?.status === 'pending') && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>{successful && <Link to={`/orders/${encodeURIComponent(orderId)}`}>View order status <span aria-hidden="true">↗</span></Link>}{attempt?.status === 'pending' && <button type="button" onClick={cancel} disabled={busy}>Cancel checkout</button>}{terminal && <button type="button" onClick={retry} disabled={busy}>Try again</button>}<Link className={styles.secondary} to="/cart">Return to cart</Link></div>
      </div>
      {order && <section className={styles.orderSummary} aria-label="Order summary"><h2>Order summary <span>{order.orderNumber}</span></h2><ul>{(order.items || []).map(item => <li key={item.bookId}><div className={styles.orderBook}>{item.coverImageUrl && <img src={item.coverImageUrl} alt={`Cover of ${item.title}`} loading="lazy" onError={event => { event.currentTarget.hidden = true; }} />}<span className={styles.coverFallback} aria-hidden="true">folio.</span><div><strong>{item.title}</strong><small>Qty {item.quantity} · {money(item.unitPrice, order.currency)} each</small></div></div><strong>{money(item.lineTotal, order.currency)}</strong></li>)}</ul><dl className={styles.totals}><div><dt>Subtotal</dt><dd>{money(subtotal, order.currency)}</dd></div><div><dt>Delivery</dt><dd>{money(0, order.currency)}</dd></div><div className={styles.orderTotal}><dt>Total</dt><dd>{money(order.totalAmount, order.currency)}</dd></div></dl><p className={styles.disclaimer}>No real payment will be processed.</p></section>}
    </div>
  </div></section>;
}
