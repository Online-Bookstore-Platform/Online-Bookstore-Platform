import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, loginPath } from '../../uditi/shared/api.js';
import { getOrderTracking, getOrders } from '../api.js';
import styles from './Orders.module.css';

const STATUSES = {
  pending: 'Pending payment',
  payment_failed: 'Payment needs another try',
  paid: 'Payment received',
  confirmed: 'Confirmed',
  processing: 'Being prepared',
  shipped: 'On its way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount ?? 0);
const date = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
const STATUS_STEPS = ['pending', 'paid', 'confirmed', 'processing', 'shipped', 'delivered'];

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

    const completedIndex = order.status === 'payment_failed' || order.status === 'cancelled'
      ? -1
      : STATUS_STEPS.indexOf(order.status);

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
          {STATUS_STEPS.filter(status => status !== 'pending').map((status, index) => {
            const actualIndex = index + 1;
            return <li key={status} className={actualIndex <= completedIndex ? styles.complete : ''} aria-current={status === order.status ? 'step' : undefined}>
              <span className={styles.stepDot} aria-hidden="true" />
              <span>{STATUSES[status]}</span>
            </li>;
          })}
        </ol>}
        {(order.status === 'pending' || order.status === 'payment_failed') && <p className={styles.pendingNote}>Your order is waiting for payment confirmation. Order status will update when the payment service confirms it.</p>}
        <p className={styles.paymentStatus}>Payment status: <strong>{order.paymentAttempts?.length ? order.paymentAttempts.at(-1).status.replaceAll('_', ' ') : 'not started'}</strong></p>
        {(order.status === 'cancelled' || order.status === 'payment_failed') && <ol className={styles.history} aria-label="Order status history">
          {history.map((event, index) => <HistoryEvent key={`${event.toStatus}-${index}`} event={event} />)}
        </ol>}
      </section>
      <div className={styles.detailsGrid}>
        <section className={styles.panel}>
          <p className="eyebrow">In this parcel</p>
          <h2>Order details</h2>
          <ul className={styles.lineItems}>{(order.items ?? []).map(item => <li key={item.bookId}>
            <div><h3>{item.title}</h3><p>{item.quantity} {item.quantity === 1 ? 'copy' : 'copies'} × {money(item.unitPrice)}</p></div>
            <strong>{money(item.lineTotal)}</strong>
          </li>)}</ul>
          <div className={styles.total}><span>Total</span><strong>{money(order.totalAmount)}</strong></div>
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
          <div className={styles.orderMain}><div><h2>{STATUSES[item.status] ?? item.status}</h2><p>{money(item.totalAmount)} <span>·</span> {item.currency}</p><p>Payment: {item.paymentStatus ? item.paymentStatus.replaceAll('_', ' ') : 'not started'}</p></div><Link to={`/orders/${item.id}`}>Track order <span aria-hidden="true">↗</span></Link></div>
        </article>)}
      </section>}
  </main>;
}

function HistoryEvent({ event }) {
  return <li className={styles.historyEvent}>
    <span className={styles.historyDot} aria-hidden="true" />
    <div><h3>{STATUSES[event.toStatus] ?? event.toStatus}</h3>{event.note && <p>{event.note}</p>}<time dateTime={event.createdAt}>{date(event.createdAt)}</time></div>
  </li>;
}
