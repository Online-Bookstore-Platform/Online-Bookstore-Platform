import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Container from '../../../components/shared/Container/Container.jsx';
import { ApiError, isAbort, loginPath } from '../shared/api.js';
import { ORDER_SERVICE_UNAVAILABLE, createOrderDraft, fetchSummary, paymentPath, saveDelivery } from './api.js';
import { FIELD_LABELS, errorsFromDetails, firstInvalidField, toFormValues, validateDelivery } from './deliveryRules.js';
import { describeSummaryChanges, stockProblems } from './summaryChanges.js';
import DeliveryForm, { fieldId } from './DeliveryForm.jsx';
import OrderSummary from './OrderSummary.jsx';
import styles from './Checkout.module.css';

/**
 * Story #7: checkout and delivery information.
 *
 *  1. The cart is read through the checkout API (which asks the cart service) and every price
 *     and stock level shown comes from the database, not from the cart.
 *  2. Delivery details are checked here while typing and again on the server.
 *  3. "Continue to payment" saves the details, re-checks prices and stock one more time, and
 *     only then asks the order service for an order and hands over to the payment page.
 *     Nothing here changes the cart, creates an order itself, or verifies a payment.
 */
export default function CheckoutPage() {
  const navigate = useNavigate();
  const [load, setLoad] = useState({ status: 'loading', summary: null, message: '', code: '' });
  const [values, setValues] = useState(() => toFormValues(null));
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [notice, setNotice] = useState(null);
  const [reload, setReload] = useState(0);
  const formPrefilled = useRef(false);
  const noticeRef = useRef(null);

  const toLogin = useCallback(() => navigate(loginPath('/checkout'), { replace: true }), [navigate]);

  useEffect(() => {
    const controller = new AbortController();
    setLoad(previous => ({ ...previous, status: 'loading' }));
    fetchSummary(controller.signal)
      .then(summary => {
        if (!formPrefilled.current) {
          formPrefilled.current = true;
          setValues(toFormValues(summary.delivery, summary.suggestedDelivery));
        }
        setLoad({ status: 'ready', summary, message: '', code: '' });
      })
      .catch(error => {
        if (isAbort(error)) return;
        if (error instanceof ApiError && error.status === 401) toLogin();
        else setLoad({ status: 'error', summary: null, message: error.message, code: error.code ?? '' });
      });
    return () => controller.abort();
  }, [reload, toLogin]);

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const problems = useMemo(() => (load.summary ? stockProblems(load.summary) : []), [load.summary]);

  function handleChange(field, value) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (errors[field]) {
      const message = validateDelivery(next).errors[field];
      setErrors(current => {
        const { [field]: _removed, ...rest } = current;
        return message ? { ...rest, [field]: message } : rest;
      });
    }
  }

  function handleBlur(field) {
    // Before the first "Continue", don't scold a field the person has only tabbed through.
    const message = values[field].trim() === '' && !attempted ? '' : validateDelivery(values).errors[field];
    setErrors(current => {
      const { [field]: _removed, ...rest } = current;
      return message ? { ...rest, [field]: message } : rest;
    });
  }

  function focusField(field) {
    document.getElementById(fieldId(field))?.focus();
  }

  async function continueToPayment(event) {
    event?.preventDefault();
    if (busy) return;
    setNotice(null);
    setAttempted(true);

    const { errors: found, clean } = validateDelivery(values);
    setErrors(found);
    const bad = firstInvalidField(found);
    if (bad) {
      setNotice({ tone: 'error', title: 'Check your delivery details', fields: Object.keys(found), messages: [] });
      return;
    }

    setBusy(true);
    try {
      await saveDelivery(clean);

      // One more look at prices and stock, right before the order is created.
      const fresh = await fetchSummary();
      const { changed, messages } = describeSummaryChanges(load.summary, fresh);
      setLoad({ status: 'ready', summary: fresh, message: '', code: '' });
      if (changed || fresh.items.length === 0 || !fresh.stock.ok) {
        setNotice({ tone: 'warning', title: 'We updated your order', messages, fields: [] });
        return;
      }

      const order = await createOrderDraft(clean, paymentMethod);
      navigate(paymentMethod === 'cod' ? `/orders/${encodeURIComponent(order.id)}` : paymentPath(order));
    } catch (error) {
      await handleSubmitError(error);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitError(error) {
    if (isAbort(error)) return;
    if (error instanceof ApiError && error.status === 401) return toLogin();
    if (error instanceof ApiError && error.status === 400 && error.details.length > 0) {
      const found = errorsFromDetails(error.details);
      setErrors(found);
      return setNotice({ tone: 'error', title: 'Check your delivery details', fields: Object.keys(found), messages: Object.keys(found).length ? [] : [error.message] });
    }
    if (error instanceof ApiError && error.code === ORDER_SERVICE_UNAVAILABLE) {
      return setNotice({ tone: 'info', title: 'Almost there', messages: [error.message], fields: [] });
    }
    if (error instanceof ApiError && ['INSUFFICIENT_STOCK', 'EMPTY_CART'].includes(error.code)) {
      setReload(count => count + 1);
      return setNotice({ tone: 'warning', title: 'We updated your order', messages: error.details.length ? error.details.map(detail => detail.message) : [error.message], fields: [] });
    }
    return setNotice({ tone: 'error', title: 'We couldn’t continue', messages: [error.message ?? 'Something went wrong. Please try again.'], fields: [] });
  }

  // --- states --------------------------------------------------------------------------------
  if (load.status === 'loading' && !load.summary) {
    return <section className={styles.state} aria-live="polite"><Container><p className="eyebrow">Checkout</p><h1>Getting your order ready…</h1></Container></section>;
  }

  if (load.status === 'error') {
    const unavailable = load.code === 'DEPENDENCY_NOT_CONFIGURED' || load.code === 'DATABASE_UNAVAILABLE';
    return (
      <section className={styles.state} role="alert">
        <Container>
          <p className="eyebrow">Checkout</p>
          <h1>{unavailable ? 'Checkout isn’t available yet.' : 'We couldn’t load your order.'}</h1>
          <p>{load.message}</p>
          <div className={styles.stateActions}>
            {!unavailable && <button type="button" onClick={() => setReload(count => count + 1)}>Try again</button>}
            <Link to="/catalogue">Back to the collection</Link>
          </div>
        </Container>
      </section>
    );
  }

  const { summary } = load;
  if (summary.items.length === 0) {
    return (
      <section className={styles.state}>
        <Container>
          <p className="eyebrow">Checkout</p>
          <h1>Your cart is empty.</h1>
          <p>Add a book you’d like to read and come back here to check out.</p>
          <div className={styles.stateActions}><Link className={styles.primaryLink} to="/catalogue">Browse the collection</Link></div>
        </Container>
      </section>
    );
  }

  const blocked = problems.length > 0;
  return (
    <section className={styles.page}>
      <Container>
        <header className={styles.header}>
          <p className="eyebrow">Checkout</p>
          <h1>A smooth path to your doorstep.</h1>
          <p>Tell us where to send your books, check the summary, and continue to payment.</p>
          <nav className={styles.progress} aria-label="Checkout progress"><span>Cart</span><i /> <strong>Delivery</strong><i /> <span>Payment</span><i /> <span>Confirmation</span></nav>
        </header>

        {notice && (
          <div className={`${styles.notice} ${styles[notice.tone]}`} role={notice.tone === 'info' ? 'status' : 'alert'} tabIndex={-1} ref={noticeRef}>
            <h2>{notice.title}</h2>
            {notice.messages.length > 0 && <ul>{notice.messages.map(message => <li key={message}>{message}</li>)}</ul>}
            {notice.fields.length > 0 && (
              <ul>
                {notice.fields.map(field => (
                  <li key={field}><a href={`#${fieldId(field)}`} onClick={event => { event.preventDefault(); focusField(field); }}>{errors[field] ?? FIELD_LABELS[field]}</a></li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className={styles.layout}>
          <DeliveryForm values={values} errors={errors} onChange={handleChange} onBlur={handleBlur} onSubmit={continueToPayment} />
          <OrderSummary summary={summary} delivery={values}>
            <fieldset className={styles.paymentMethods}><legend>Payment method</legend>{[['card','Credit or debit card'],['upi','UPI'],['netbanking','Net banking'],['cod','Cash on delivery']].map(([value,label]) => <label key={value}><input type="radio" name="paymentMethod" value={value} checked={paymentMethod===value} onChange={() => setPaymentMethod(value)} /> {label}</label>)}{paymentMethod === 'cod' && <p>Payment is due when your order is delivered.</p>}</fieldset>
            {blocked && <p className={styles.blocked}>Some books in your order can’t be bought as chosen. <Link to="/cart">Change your cart</Link> to continue.</p>}
            <button className={styles.continue} type="submit" form="delivery-form" disabled={busy || blocked}>
              {busy ? 'Checking your order…' : 'Continue to payment'} <span aria-hidden="true">↗</span>
            </button>
            <p className={styles.fine}>Prices and stock are checked again just before your order is created. You won’t be charged on this page.</p>
          </OrderSummary>
        </div>
      </Container>
    </section>
  );
}
