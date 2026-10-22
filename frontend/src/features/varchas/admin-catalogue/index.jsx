import { useCallback, useEffect, useState } from 'react';
import AdminOnly from '../authentication/AdminOnly.jsx';
import { apiRequest, logout } from '../api.js';
import styles from './AdminCatalogue.module.css';

const emptyBook = { title: '', author: '', isbn: '', category: '', description: '', price: '', coverImageUrl: '' };

function CatalogueManager() {
  const [books, setBooks] = useState([]);
  const [form, setForm] = useState(emptyBook);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
    if (Object.entries(form).some(([field, value]) => field !== 'coverImageUrl' && !value.trim()) || !Number.isFinite(payload.price) || payload.price < 0) {
      setError('Complete each field with a valid non-negative price.');
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
      <div className={styles.fields}>{[['title', 'Title'], ['author', 'Author'], ['isbn', 'ISBN'], ['category', 'Category'], ['price', 'Price (INR)'], ['coverImageUrl', 'Cover image URL']].map(([key, label]) => <label key={key}>{label}<input required={key !== 'coverImageUrl'} name={key} type={key === 'price' ? 'number' : key === 'coverImageUrl' ? 'url' : 'text'} min={key === 'price' ? '0' : undefined} step={key === 'price' ? '0.01' : undefined} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>)}
        <label className={styles.full}>Description<textarea required name="description" rows="4" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label>
      </div>
      {message && <p className={styles.success} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to catalogue'}</button>
    </form>
    <div className={styles.listHeader}><h2>Current books</h2><button type="button" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {error && !books.length && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <p className={styles.empty} aria-live="polite">Loading catalogue…</p> : books.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Book</th><th scope="col">ISBN</th><th scope="col">Category</th><th scope="col">Price</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{books.map(book => <tr key={book.id}><td><strong>{book.title}</strong><small>{book.author}</small></td><td>{book.isbn || '—'}</td><td>{book.category || '—'}</td><td>{book.price == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: book.currency || 'INR' }).format(Number(book.price))}</td><td className={styles.actions}><button type="button" onClick={() => editBook(book)}>Edit</button><button type="button" onClick={() => removeBook(book)}>Remove</button></td></tr>)}</tbody></table></div> : <p className={styles.empty}>No books found yet.</p>}
  </section>;
}

export default function AdminCataloguePage() { return <AdminOnly><CatalogueManager /></AdminOnly>; }
