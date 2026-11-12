import { useEffect, useMemo, useState } from 'react';
import AdminOnly from '../../varchas/authentication/AdminOnly.jsx';
import { apiRequest } from '../../varchas/api.js';
import styles from './AdminOrders.module.css';

const STATUS_LABELS = {
  pending: 'Pending', pending_collection: 'Payment due', paid: 'Paid', confirmed: 'Confirmed',
  processing: 'Processing', packed: 'Packed', shipped: 'Shipped', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned', return_requested: 'Return requested',
  payment_failed: 'Payment failed',
};
const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value) || 0);
const date = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const statusLabel = value => STATUS_LABELS[value] || String(value || 'Unknown').replaceAll('_', ' ');
const paymentLabel = value => ({ succeeded: 'Paid', pending: 'Pending', pending_collection: 'Due on delivery', collected: 'Collected', failed: 'Failed' }[value] || statusLabel(value));
const nextStatus = { confirmed: 'processing', processing: 'shipped', shipped: 'delivered' };

function AdminOrdersDashboard() {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [changeTarget, setChangeTarget] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest('/api/admin/orders').then(result => {
      if (active) { setOrders(Array.isArray(result.orders) ? result.orders : []); setError(''); }
    }).catch(requestError => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const counts = useMemo(() => ({
    total: orders.length,
    processing: orders.filter(order => order.status === 'processing').length,
    shipped: orders.filter(order => order.status === 'shipped').length,
    delivered: orders.filter(order => order.status === 'delivered').length,
    cancelled: orders.filter(order => order.status === 'cancelled').length,
  }), [orders]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return orders.filter(order => {
      const matchesQuery = !needle || [order.id, order.orderNumber, order.customerName, order.customerEmail].some(value => String(value || '').toLocaleLowerCase().includes(needle));
      return matchesQuery && (statusFilter === 'all' || order.status === statusFilter);
    });
  }, [orders, query, statusFilter]);

  async function openDetails(order) {
    setError('');
    try { const result = await apiRequest(`/api/admin/orders/${encodeURIComponent(order.id)}`); setSelected(result.order); }
    catch (requestError) { setError(requestError.message); }
  }

  async function confirmStatusChange() {
    if (!changeTarget || updating) return;
    setUpdating(true); setError(''); setNotice('');
    try {
      const result = await apiRequest(`/api/admin/orders/${encodeURIComponent(changeTarget.id)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: changeTarget.next }),
      });
      const updatedStatus = result.order.status;
      setOrders(current => current.map(order => String(order.id) === String(changeTarget.id) ? { ...order, status: updatedStatus } : order));
      setSelected(current => current && String(current.id) === String(changeTarget.id)
        ? { ...current, status: updatedStatus, history: [...(current.history || []), { fromStatus: changeTarget.current, toStatus: updatedStatus, note: 'Status updated by administrator.', createdAt: new Date().toISOString() }] }
        : current);
      if (statusFilter === changeTarget.current) setStatusFilter(updatedStatus);
      setNotice(`Order #${changeTarget.orderNumber || changeTarget.id} updated to ${statusLabel(updatedStatus)}.`);
      setChangeTarget(null);
      setReload(value => value + 1);
      if (selected && String(selected.id) === String(changeTarget.id)) {
        try {
          const refreshed = await apiRequest(`/api/admin/orders/${encodeURIComponent(changeTarget.id)}`);
          setSelected(refreshed.order);
        } catch {
          // The committed status is already reflected locally; keep the modal usable if refresh fails.
        }
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setUpdating(false); }
  }

  function requestStatusUpdate(order) {
    const next = nextStatus[order.status];
    if (!next || updating) return;
    setChangeTarget({ id: order.id, orderNumber: order.orderNumber || order.order_number, current: order.status, next });
  }

  return <main className={styles.page}>
    <header className={styles.heading}>
      <div><p className="eyebrow">Folio · Administration</p><h1>Orders, in one place.</h1><p>Review customer purchases and move fulfilment forward.</p></div>
      <button type="button" className={styles.refresh} onClick={() => setReload(value => value + 1)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh orders'}</button>
    </header>

    <section className={styles.metrics} aria-label="Order overview">
      {[
        ['Total orders', counts.total], ['Processing', counts.processing], ['Shipped', counts.shipped],
        ['Delivered', counts.delivered], ['Cancelled', counts.cancelled],
      ].map(([label, value]) => <article className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </section>

    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}

    <section className={styles.ordersPanel} aria-labelledby="orders-heading">
      <div className={styles.panelHead}><div><p className="eyebrow">Customer orders</p><h2 id="orders-heading">Order list</h2></div><span>{filtered.length} shown</span></div>
      <div className={styles.filters}>
        <label>Search orders<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Order ID, customer name or email" /></label>
        <label>Order status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {loading ? <p className={styles.empty} role="status">Loading customer orders…</p> : filtered.length === 0
        ? <p className={styles.empty} role="status">{orders.length ? 'No orders match these filters.' : 'There are no customer orders yet.'}</p>
        : <div className={styles.tableWrap}><table><thead><tr>
          <th scope="col">Order ID</th><th scope="col">Customer</th><th scope="col">Date</th><th scope="col">Items</th><th scope="col">Total</th><th scope="col">Payment</th><th scope="col">Status</th><th scope="col">Actions</th>
        </tr></thead><tbody>{filtered.map(order => <tr key={order.id}>
          <td><span className={styles.orderNumber}>#{order.orderNumber || order.id}</span><small>#{order.id}</small></td>
          <td>{order.customerName || 'Customer'}<small>{order.customerEmail}</small></td>
          <td>{date(order.createdAt)}</td>
          <td>{(order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)} items</td>
          <td>{money(order.totalAmount, order.currency)}</td>
          <td>{paymentLabel(order.paymentStatus)}</td>
          <td><span className={`${styles.badge} ${styles[`status_${order.status}`] || ''}`}>{statusLabel(order.status)}</span></td>
          <td><div className={styles.rowActions}><button type="button" onClick={() => openDetails(order)}>View details</button>{nextStatus[order.status] && <button type="button" disabled={updating} onClick={() => requestStatusUpdate(order)}>Update Status: {statusLabel(nextStatus[order.status])}</button>}</div></td>
        </tr>)}</tbody></table></div>}
    </section>

    {selected && <OrderDetails order={selected} onClose={() => setSelected(null)} onUpdateStatus={requestStatusUpdate} updating={updating} />}
    {changeTarget && <div className={styles.overlay}><section className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="status-confirm-title">
      <span className={styles.dialogMark} aria-hidden="true">↗</span><p className="eyebrow">Fulfilment update</p>
      <h2 id="status-confirm-title">Move order #{changeTarget.orderNumber || changeTarget.id} to {statusLabel(changeTarget.next)}?</h2>
      <p>This updates the order timeline for the customer. Cancelled orders cannot enter the shipping flow.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.dialogActions}><button type="button" disabled={updating} onClick={() => setChangeTarget(null)}>Keep current status</button><button type="button" disabled={updating} className={styles.primary} onClick={confirmStatusChange}>{updating ? 'Updating…' : `Confirm ${statusLabel(changeTarget.next)}`}</button></div>
    </section></div>}
  </main>;
}

function OrderDetails({ order, onClose, onUpdateStatus, updating }) {
  const get = (camel, snake) => order[camel] ?? order[snake];
  const orderId = get('orderNumber', 'order_number') || order.id;
  const items = order.items || [];
  const history = order.history || [];
  const address = [get('addressLine1', 'address_line1'), get('addressLine2', 'address_line2'), order.city, order.state, get('postalCode', 'postal_code'), order.country].filter(Boolean).join(', ');
  return <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.detailDialog} role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <header className={styles.detailHead}><div><p className="eyebrow">Complete order</p><h2 id="detail-title">Order #{orderId}</h2></div><button type="button" onClick={onClose} aria-label="Close order details">Close</button></header>
      {nextStatus[order.status] && <div className={styles.detailStatusAction}><span>Next status: <strong>{statusLabel(nextStatus[order.status])}</strong></span><button type="button" disabled={updating} onClick={() => onUpdateStatus(order)}>Update Status</button></div>}
      <div className={styles.detailGrid}>
        <section><h3>Customer</h3><p>{get('customerName', 'customerName') || 'Customer'}</p><p>{get('customerEmail', 'email') || 'Email unavailable'}</p><p>{get('phone', 'phone') || 'Phone unavailable'}</p></section>
        <section><h3>Delivery</h3><p>{get('recipientName', 'recipient_name') || '—'}</p><p>{address || 'Address unavailable'}</p></section>
        <section><h3>Payment</h3><p>{statusLabel(get('paymentMethod', 'payment_method'))}</p><p>{paymentLabel(get('paymentStatus', 'payment_status'))}</p><p>{money(get('totalAmount', 'total_amount'), order.currency || 'INR')}</p></section>
        <section><h3>Order</h3><p>{statusLabel(order.status)}</p><p>Placed {date(get('createdAt', 'created_at'))}</p><p>{items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} items</p></section>
      </div>
      <section className={styles.detailSection}><h3>Books in this order</h3>{items.length ? <ul className={styles.itemList}>{items.map((item, index) => <li key={`${item.bookId || item.book_id}-${index}`}><span>{item.title || item.book_title} <small>× {item.quantity}</small></span><strong>{money(Number(item.unitPrice ?? item.unit_price) * Number(item.quantity), order.currency || 'INR')}</strong></li>)}</ul> : <p>No item details available.</p>}</section>
      <section className={styles.detailSection}><h3>Order timeline</h3>{history.length ? <ol className={styles.timeline}>{history.map((entry, index) => <li key={`${entry.toStatus || entry.to_status}-${index}`}><strong>{statusLabel(entry.toStatus || entry.to_status)}</strong><time>{date(entry.createdAt || entry.created_at)}</time>{entry.note && <p>{entry.note}</p>}</li>)}</ol> : <p>No status history available.</p>}</section>
    </section>
  </div>;
}

export default function AdminOrdersPage() {
  return <AdminOnly><AdminOrdersDashboard /></AdminOnly>;
}
