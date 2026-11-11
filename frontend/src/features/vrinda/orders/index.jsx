import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, loginPath } from '../../uditi/shared/api.js';
import { cancelOrder, getOrderTracking, getOrders, requestOrderReturn } from '../api.js';
import styles from './Orders.module.css';

const STATUSES = {
  pending: 'Awaiting checkout',
  pending_collection: 'Payment due on delivery',
  payment_failed: 'Checkout not completed',
  paid: 'Order confirmed',
  confirmed: 'Confirmed',
  processing: 'Being prepared',
  packed: 'Packed',
  shipped: 'On its way',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  return_requested: 'Return requested',
  returned: 'Returned',
};
const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount ?? 0);
const date = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
const STATUS_STEPS = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const paymentMethodLabel = method => ({ upi: 'UPI', card: 'Card', netbanking: 'Net banking', cod: 'Cash on delivery' }[method] || method || 'Card');
const customerPaymentStatus = order => ({ pending: 'Awaiting verification', pending_collection: 'Due on delivery', succeeded: 'Verified by email', collected: 'Collected', failed: 'Verification failed' }[order.paymentStatus] || order.paymentStatus || 'Awaiting verification');

export default function OrdersPage({ tracking = false }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const request = tracking ? getOrderTracking(orderId, controller.signal) : getOrders(controller.signal);
    request.then(result => {
      if (tracking) {
        setOrder(result.order);
        setHistory(result.statusHistory);
      } else {
        setOrders(result);
      }
    }).catch(requestError => {
      if (requestError.name === 'AbortError') return;
      if (requestError instanceof ApiError && requestError.status === 401) {
        navigate(loginPath(tracking ? `/orders/${orderId}` : '/orders'), { replace: true });
        return;
      }
      setError(requestError.message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [tracking, orderId, navigate, reloadKey]);

  if (loading) return <main className={styles.state} aria-live="polite"><p>{tracking ? 'Following your order…' : 'Finding your past orders…'}</p></main>;

  if (tracking) {
    if (error || !order) return <main className={styles.state}>
      <p className="eyebrow">Order tracking</p><h1>{error ? 'We couldn’t load this order.' : 'We couldn’t find that order.'}</h1>
      <p className={styles.message} role="alert">{error || 'This order may have been removed, or it may belong to another account.'}</p>
      <div className={styles.stateActions}>
        {error && <button type="button" onClick={() => setReloadKey(value => value + 1)}>Try again</button>}
        <Link className={styles.textLink} to="/orders">Back to your orders</Link>
      </div>
    </main>;

    const statusSteps = STATUS_STEPS;
    const trackingStatus = order.status === 'pending_collection' ? 'pending' : order.status === 'paid' ? 'confirmed' : ['return_requested', 'returned'].includes(order.status) ? 'delivered' : order.status;
    const completedIndex = order.status === 'payment_failed' || order.status === 'cancelled'
      ? -1
      : statusSteps.indexOf(trackingStatus);
    const historyByStatus = new Map(history.map(event => [event.toStatus === 'pending_collection' ? 'pending' : event.toStatus === 'paid' ? 'confirmed' : event.toStatus, event.createdAt]));

    return <main className={styles.page}>
      <Link className={styles.back} to="/orders">← Your orders</Link>
      <header className={styles.header}>
        <p className="eyebrow">The journey so far</p>
        <h1>Order {order.orderNumber}</h1>
        <p>Placed {date(order.createdAt)} <span aria-hidden="true">·</span> {money(order.totalAmount)}</p>
      </header>
      <section className={styles.statusCard} aria-labelledby="status-title">
        <div className={styles.statusHead}>
          <div><p className="eyebrow">Current status</p><h2 id="status-title">{STATUSES[order.status] ?? order.status}</h2></div>
          <span className={`${styles.badge} ${order.status === 'cancelled' ? styles.stopped : ''}`}>{STATUSES[order.status] ?? order.status}</span>
        </div>
        {completedIndex >= 0 && <ol className={styles.progress} aria-label="Order progress">
          {statusSteps.map((status, index) => {
            const current = status === trackingStatus;
            return <li key={status} className={`${index < completedIndex ? styles.complete : ''} ${current ? styles.current : ''}`} aria-current={current ? 'step' : undefined}>
              <span className={styles.stepDot} aria-hidden="true" />
              <span>{status === 'pending' ? 'Order placed' : STATUSES[status]}</span>
              {historyByStatus.has(status) && <time dateTime={historyByStatus.get(status)}>{date(historyByStatus.get(status))}</time>}
            </li>;
          })}
        </ol>}
        {order.paymentMethod === 'cod' && <p className={styles.pendingNote}>Cash on delivery selected. Payment is due when your books arrive.</p>}
        {order.paymentMethod !== 'cod' && (order.status === 'pending' || order.status === 'payment_failed') && <p className={styles.pendingNote}>Your order is waiting for checkout confirmation. You can return to checkout to try again.</p>}
        <p className={styles.paymentStatus}>Payment method: <strong>{paymentMethodLabel(order.paymentMethod)}</strong></p>
        <p className={styles.paymentStatus}>Payment status: <strong>{customerPaymentStatus(order)}</strong></p>
        {(order.status === 'cancelled' || order.status === 'payment_failed') && <ol className={styles.history} aria-label="Order status history">
          {history.map((event, index) => <HistoryEvent key={`${event.toStatus}-${index}`} event={event} />)}
        </ol>}
      </section>
      {order.status === 'delivered' && <button type="button" onClick={async () => { try { await requestOrderReturn(order.id); setReloadKey(value => value + 1); } catch (err) { setError(err.message); } }}>Request a return</button>}
      {['pending', 'pending_collection'].includes(order.status) && order.paymentStatus !== 'succeeded' && <button type="button" onClick={async () => { try { await cancelOrder(order.id); setReloadKey(value => value + 1); } catch (err) { setError(err.message); } }}>Cancel order</button>}
      <div className={styles.detailsGrid}>
        <section className={styles.panel}>
          <p className="eyebrow">In this parcel</p>
          <h2>Order details</h2>
          <ul className={styles.lineItems}>{(order.items ?? []).map(item => <li key={item.bookId}>
            {item.coverImageUrl ? <img src={item.coverImageUrl} alt={`Cover of ${item.title}`} loading="lazy" /> : <div className={styles.coverFallback} aria-hidden="true">folio.</div>}
            <div className={styles.itemCopy}><h3>{item.title}</h3><p>{item.quantity} {item.quantity === 1 ? 'copy' : 'copies'} × {money(item.unitPrice)}</p></div>
            <strong>{money(item.lineTotal)}</strong>
          </li>)}</ul>
          <div className={styles.amountRows}><div><span>Subtotal</span><strong>{money(order.subtotalAmount ?? order.totalAmount)}</strong></div><div><span>Delivery charge</span><strong>{order.deliveryCharge === 0 ? 'Free' : money(order.deliveryCharge)}</strong></div></div>
          <div className={styles.total}><span>Final amount</span><strong>{money(order.totalAmount)}</strong></div>
        </section>
        <section className={styles.panel}>
          <p className="eyebrow">Delivery details</p>
          <h2>Going to</h2>
          <address>{order.recipientName}<br />{order.phone}<br />{order.addressLine1}<br />{order.addressLine2 && <>{order.addressLine2}<br /></>}{order.city}, {order.state} {order.postalCode}<br />{order.country}</address>
        </section>
      </div>
      {order.status !== 'cancelled' && order.status !== 'payment_failed' && <section className={styles.panel}>
        <p className="eyebrow">Updates</p><h2>Order timeline</h2>
        <ol className={styles.history}>{history.map((event, index) => <HistoryEvent key={`${event.toStatus}-${index}`} event={event} />)}</ol>
      </section>}
      <Link className={styles.continueShopping} to="/catalogue">Continue shopping <span aria-hidden="true">↗</span></Link>
    </main>;
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <p className="eyebrow">Your reading life</p><h1>Your past reads, remembered.</h1>
      <p>Find every order and follow its journey home.</p>
    </header>
    {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => setReloadKey(value => value + 1)}>Try again</button></div>}
    {error && !orders.length
      ? null
      : !orders.length
      ? <section className={styles.empty}>
        <p className="eyebrow">No orders yet</p><h2>Your next favorite story is waiting.</h2>
        <p>When you place an order, you’ll find its details and delivery updates here.</p>
        <Link className={styles.primaryLink} to="/catalogue">Explore the catalogue <span aria-hidden="true">↗</span></Link>
      </section>
      : <section className={styles.orderList} aria-label="Your orders">
        {orders.map(item => <article className={styles.orderCard} key={item.id}>
          <div className={styles.orderMeta}><p className="eyebrow">Order {item.orderNumber}</p><span>{date(item.createdAt)}</span></div>
          <div className={styles.orderMain}><div><h2>{STATUSES[item.status] ?? item.status}</h2><p>{money(item.totalAmount)} <span>·</span> {item.currency}</p><p>Payment method: {paymentMethodLabel(item.paymentMethod)} · {customerPaymentStatus(item)}</p></div><Link to={`/orders/${item.id}`}>Track order <span aria-hidden="true">↗</span></Link></div>
        </article>)}
      </section>}
  </main>;
}

function HistoryEvent({ event }) {
  const note = event.toStatus === 'paid'
    ? 'Your order was confirmed at checkout.'
    : event.toStatus === 'confirmed' && /simulat/i.test(event.note || '')
      ? 'Payment verified by email and order confirmed.'
    : event.toStatus === 'payment_failed'
      ? 'Checkout was not completed. Your order was not confirmed.'
      : event.note;
  return <li className={styles.historyEvent}>
    <span className={styles.historyDot} aria-hidden="true" />
    <div><h3>{STATUSES[event.toStatus] ?? event.toStatus}</h3>{note && <p>{note}</p>}<time dateTime={event.createdAt}>{date(event.createdAt)}</time></div>
  </li>;
}
