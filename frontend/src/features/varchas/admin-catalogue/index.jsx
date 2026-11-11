import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AdminOnly from '../authentication/AdminOnly.jsx';
import { apiRequest, logout } from '../api.js';
import styles from './AdminCatalogue.module.css';

const emptyBook = { title: '', author: '', isbn: '', openLibraryWorkId: '', category: '', description: '', price: '', coverImageUrl: '' };

function CatalogueManager({ discoveredBook, editBookId }) {
  const [books, setBooks] = useState([]);
  const [form, setForm] = useState(emptyBook);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/api/admin/books');
      setBooks(result.books || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!editBookId || loading) return;
    const book = books.find(item => String(item.id) === String(editBookId));
    if (!book) return;
    setEditingId(book.id);
    setForm(Object.fromEntries(Object.keys(emptyBook).map(key => [key, key === 'price' ? String(book[key] ?? '') : book[key] ?? ''])));
  }, [books, editBookId, loading]);
  useEffect(() => {
    if (!discoveredBook?.title) return;
    setEditingId(null);
    setForm({ ...emptyBook, title: discoveredBook.title || '', author: discoveredBook.author || '', isbn: discoveredBook.isbn || '', openLibraryWorkId: discoveredBook.openLibraryWorkId || '', category: discoveredBook.category || '', description: discoveredBook.description || '', coverImageUrl: discoveredBook.coverImageUrl || '' });
    setMessage('Verified discovery metadata is prefilled. Enter Folio’s actual price; new products start with zero stock.');
  }, [discoveredBook]);
  const visibleBooks = books.filter(book => `${book.title} ${book.author} ${book.isbn || ''} ${book.category || ''}`.toLowerCase().includes(search.trim().toLowerCase()));

  function editBook(book) {
    setEditingId(book.id);
    setForm(Object.fromEntries(Object.keys(emptyBook).map(key => [key, key === 'price' ? String(book[key] ?? '') : book[key] ?? ''])));
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() { setEditingId(null); setForm(emptyBook); }

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    const payload = { ...form, price: Number(form.price) };
    if (Object.entries(form).some(([field, value]) => !['coverImageUrl', 'isbn', 'openLibraryWorkId'].includes(field) && !value.trim()) || !Number.isFinite(payload.price) || payload.price <= 0) {
      setError('Complete each field with an actual price greater than zero. Stock is configured separately in Inventory.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest(editingId ? `/api/admin/books/${encodeURIComponent(editingId)}` : '/api/admin/books', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setMessage(editingId ? 'Book details updated.' : 'Book added to the catalogue.');
      resetForm();
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeBook(book) {
    if (!window.confirm(`Remove “${book.title}” from the catalogue?`)) return;
    setMessage('');
    setError('');
    try {
      await apiRequest(`/api/admin/books/${encodeURIComponent(book.id)}`, { method: 'DELETE' });
      setMessage('Book removed or deactivated.');
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function signOut() {
    try { await logout(); } finally { window.location.assign('/'); }
  }

  return <section className={styles.page}><div className={styles.heading}><div><p className="eyebrow">Administrator · Story #11</p><h1>Catalogue studio.</h1><p>Manage book details and prices. Stock quantities belong to the inventory feature.</p></div><button className={styles.signout} type="button" onClick={signOut}>Sign out</button></div>
    <form className={styles.form} onSubmit={submit}><div className={styles.formHeading}><h2>{editingId ? 'Edit a book' : 'Add a book'}</h2>{editingId && <button type="button" className={styles.cancel} onClick={resetForm}>Cancel editing</button>}</div>
      <div className={styles.fields}>{[['title', 'Title'], ['author', 'Author'], ['isbn', 'ISBN (optional)'], ['category', 'Category'], ['price', 'Price (INR)'], ['coverImageUrl', 'Cover image URL']].map(([key, label]) => <label key={key}>{label}<input required={!['coverImageUrl', 'isbn'].includes(key)} name={key} type={key === 'price' ? 'number' : key === 'coverImageUrl' ? 'url' : 'text'} min={key === 'price' ? '0.01' : undefined} step={key === 'price' ? '0.01' : undefined} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>)}
        <label className={styles.full}>Description<textarea required name="description" rows="4" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label>
      </div>
      {message && <p className={styles.success} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to catalogue'}</button>
    </form>
    <div className={styles.listHeader}><h2>Current books</h2><button type="button" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {error && !books.length && <p className={styles.error} role="alert">{error}</p>}
    <label className={styles.search}>Search catalogue<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, author, ISBN or category" /></label>
    {loading ? <p className={styles.empty} aria-live="polite">Loading catalogue…</p> : visibleBooks.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Book</th><th scope="col">ISBN</th><th scope="col">Category</th><th scope="col">Price</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{visibleBooks.map(book => <tr key={book.id}><td><strong>{book.title}</strong><small>{book.author}{book.isActive === false && ' · Inactive'}</small></td><td>{book.isbn || '—'}</td><td>{book.category || '—'}</td><td>{book.price == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: book.currency || 'INR' }).format(Number(book.price))}</td><td className={styles.actions}><button type="button" onClick={() => editBook(book)}>Edit</button><button type="button" disabled={book.isActive === false} onClick={() => removeBook(book)}>{book.isActive === false ? 'Removed' : 'Remove'}</button></td></tr>)}</tbody></table></div> : <p className={styles.empty}>{books.length ? 'No books match that search.' : 'No books found yet.'}</p>}
  </section>;
}

const paymentMethodLabel = method => ({ upi: 'UPI', card: 'Card', netbanking: 'Net banking', cod: 'Cash on delivery' }[method] || method || 'Card');
const paymentStateLabel = status => ({ succeeded: 'Verified by email', pending: 'Awaiting verification', pending_collection: 'Due on delivery', collected: 'Collected', failed: 'Verification failed' }[status] || status);
const orderHistoryNote = note => /simulat/i.test(note || '') ? 'Payment verified by email and order confirmed.' : note;

function OrderManager() {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const refresh = async () => { try { const result = await apiRequest('/api/admin/orders'); setOrders(result.orders); setError(''); } catch (err) { setError(err.message); } };
  useEffect(() => { refresh(); }, []);
  async function open(order) { try { const result = await apiRequest(`/api/admin/orders/${order.id}`); setSelected(result.order); } catch (err) { setError(err.message); } }
  async function update(order, status) { try { await apiRequest(`/api/admin/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await refresh(); if (selected?.id === order.id) await open(order); } catch (err) { setError(err.message); } }
  async function collect(order) { try { await apiRequest(`/api/admin/orders/${order.id}/payment`, { method: 'PATCH', body: JSON.stringify({ status: 'collected' }) }); await refresh(); } catch (err) { setError(err.message); } }
  const next = { pending_collection: 'confirmed', paid: 'confirmed', confirmed: 'processing', processing: 'packed', packed: 'shipped', shipped: 'out_for_delivery', out_for_delivery: 'delivered', return_requested: 'returned' };
  return <section><div className={styles.listHeader}><h2>Order management</h2><button type="button" onClick={refresh}>Refresh orders</button></div>{error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.tableWrap}><table><thead><tr><th>Order</th><th>Status</th><th>Payment</th><th>Total</th><th>Actions</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td><button type="button" onClick={() => open(order)}>#{order.orderNumber}</button><small>Customer {order.userId} · {new Date(order.createdAt).toLocaleString()}</small></td><td>{order.status.replaceAll('_', ' ')}</td><td>{paymentMethodLabel(order.paymentMethod)} · {paymentStateLabel(order.paymentStatus)}</td><td>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: order.currency }).format(Number(order.totalAmount))}</td><td className={styles.actions}>{next[order.status] && <button type="button" onClick={() => update(order, next[order.status])}>Mark {next[order.status].replaceAll('_', ' ')}</button>}{order.status === 'delivered' && order.paymentMethod === 'cod' && order.paymentStatus === 'pending_collection' && <button type="button" onClick={() => collect(order)}>Mark collected</button>}{['pending_collection', 'pending'].includes(order.status) && order.paymentStatus !== 'succeeded' && <button type="button" onClick={() => update(order, 'cancelled')}>Cancel</button>}{['confirmed', 'processing', 'packed'].includes(order.status) && (order.paymentMethod === 'cod' || order.paymentStatus !== 'succeeded') && <button type="button" onClick={() => update(order, 'cancelled')}>Cancel</button>}</td></tr>)}</tbody></table></div>
    {selected && <div className={styles.form}><div className={styles.formHeading}><h2>Order #{selected.order_number}</h2><button className={styles.cancel} type="button" onClick={() => setSelected(null)}>Close</button></div><p>{selected.status.replaceAll('_', ' ')} · Payment verification: {paymentStateLabel(selected.payment_status)} ({paymentMethodLabel(selected.payment_method)})</p><ul>{selected.items?.map(item => <li key={item.bookId}>{item.title} · {item.quantity} × ₹{item.unitPrice}</li>)}</ul><ol>{selected.history?.map((entry, index) => <li key={index}>{entry.toStatus.replaceAll('_', ' ')} · {new Date(entry.createdAt).toLocaleString()}{orderHistoryNote(entry.note) && ` — ${orderHistoryNote(entry.note)}`}</li>)}</ol></div>}
  </section>;
}

export default function AdminCataloguePage() { const location = useLocation(); return <AdminOnly><CatalogueManager discoveredBook={location.state?.discoveredBook} editBookId={location.state?.editBookId} /><OrderManager /></AdminOnly>; }
