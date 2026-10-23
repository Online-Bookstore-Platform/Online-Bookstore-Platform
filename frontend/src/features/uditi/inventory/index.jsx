import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Container from '../../../components/shared/Container/Container.jsx';
import Pagination from '../catalogue/Pagination.jsx';
import catalogueStyles from '../catalogue/Catalogue.module.css';
import { ApiError, getSignedInUser, isAbort, loginPath } from '../shared/api.js';
import { fetchStock } from './api.js';
import { STATUS_FILTERS } from './inventoryRules.js';
import StockRow from './StockRow.jsx';
import styles from './Inventory.module.css';

const PAGE_SIZE = 20;

/** Who is asking? Customers and signed-out visitors never see the stock room. */
function useAdminAccess() {
  const navigate = useNavigate();
  const [access, setAccess] = useState({ status: 'checking', message: '' });

  useEffect(() => {
    const controller = new AbortController();
    getSignedInUser(controller.signal)
      .then(user => {
        if (user === null) navigate(loginPath('/inventory'), { replace: true });
        else setAccess({ status: user.role === 'admin' ? 'allowed' : 'denied', message: '' });
      })
      .catch(error => { if (!isAbort(error)) setAccess({ status: 'error', message: error.message }); });
    return () => controller.abort();
  }, [navigate]);

  return access;
}

/**
 * Story #10, administrator view: the real stock of every book (GET /api/inventory/stock),
 * with search, low/out-of-stock filters, paging and a stock editor. Title, price and
 * description editing is Varchas's administrator catalogue and is not duplicated here.
 */
export default function InventoryPage() {
  const access = useAdminAccess();
  return access.status === 'allowed' ? <StockRoom /> : <AccessGate access={access} />;
}

function AccessGate({ access }) {
  if (access.status === 'checking') return <section className={styles.gate} aria-live="polite"><Container>Checking your access…</Container></section>;
  if (access.status === 'error') {
    return (
      <section className={styles.gate} role="alert">
        <Container>
          <p className="eyebrow">Inventory</p>
          <h1>We couldn’t verify your access.</h1>
          <p>{access.message}</p>
          <button type="button" onClick={() => window.location.reload()}>Try again</button>
        </Container>
      </section>
    );
  }
  return (
    <section className={styles.gate} role="status">
      <Container>
        <p className="eyebrow">Inventory</p>
        <h1>Administrator access is required.</h1>
        <p>Stock levels are only available to the bookstore’s administrators.</p>
        <Link to="/">Return to folio</Link>
      </Container>
    </section>
  );
}

function StockRoom() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ q: '', status: 'all', page: 1 });
  const [searchDraft, setSearchDraft] = useState('');
  const [result, setResult] = useState({ status: 'loading', stock: [], pagination: null, message: '' });
  const [reload, setReload] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const tableHeading = useRef(null);

  const signedOut = useCallback(() => navigate(loginPath('/inventory'), { replace: true }), [navigate]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(filters.page), pageSize: String(PAGE_SIZE) });
    if (filters.q) params.set('q', filters.q);
    if (filters.status !== 'all') params.set('status', filters.status);

    setResult(previous => ({ ...previous, status: 'loading' }));
    fetchStock(params.toString(), controller.signal)
      .then(body => setResult({ status: 'ready', stock: body.stock, pagination: body.pagination, message: '' }))
      .catch(error => {
        if (isAbort(error)) return;
        if (error instanceof ApiError && error.status === 401) signedOut();
        else setResult({ status: 'error', stock: [], pagination: null, message: error.message });
      });
    return () => controller.abort();
  }, [filters, reload, signedOut]);

  function updated(stock, message) {
    setResult(current => ({ ...current, stock: current.stock.map(item => (item.bookId === stock.bookId ? stock : item)) }));
    setAnnouncement(message);
  }

  const { status, stock, pagination } = result;
  const filtered = filters.q !== '' || filters.status !== 'all';

  return (
    <section className={styles.page}>
      <Container>
        <header className={styles.header}>
          <p className="eyebrow">Inventory · Administrators</p>
          <h1>Keeping the shelves in step.</h1>
          <p>Exact stock for every book. Customers only ever see “in stock”, “only a few left” or “out of stock”.</p>
        </header>

        <div className={styles.controls}>
          <form className={catalogueStyles.search} role="search" onSubmit={event => { event.preventDefault(); setFilters(current => ({ ...current, q: searchDraft.trim(), page: 1 })); }}>
            <label className="visually-hidden" htmlFor="inventory-search">Search by title, author or ISBN</label>
            <input id="inventory-search" type="search" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="Search by title, author or ISBN" maxLength={100} autoComplete="off" />
            <button type="submit">Search</button>
          </form>
          <div className={styles.segments} role="group" aria-label="Filter by stock level">
            {STATUS_FILTERS.map(option => (
              <button key={option.value} type="button" aria-pressed={filters.status === option.value} onClick={() => setFilters(current => ({ ...current, status: option.value, page: 1 }))}>{option.label}</button>
            ))}
          </div>
        </div>

        <p className={styles.announcement} role="status" aria-live="polite">{announcement}</p>

        <h2 className="visually-hidden" tabIndex={-1} ref={tableHeading}>Stock levels</h2>
        {status === 'error' && (
          <div className={styles.error} role="alert">
            <p><strong>We couldn’t load the stock.</strong> {result.message}</p>
            <button type="button" onClick={() => setReload(count => count + 1)}>Try again</button>
          </div>
        )}

        {status !== 'error' && (
          <div className={styles.tableWrap} aria-busy={status === 'loading'}>
            <table className={`${styles.table} ${status === 'loading' && stock.length > 0 ? styles.refreshing : ''}`}>
              <caption className="visually-hidden">Stock levels, lowest first</caption>
              <thead>
                <tr><th scope="col">Book</th><th scope="col">Availability</th><th scope="col" className={styles.quantity}>In stock</th><th scope="col">Last updated</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr>
              </thead>
              <tbody>
                {stock.map(item => <StockRow key={item.bookId} item={item} onUpdated={updated} onSignedOut={signedOut} onStale={() => setReload(count => count + 1)} />)}
              </tbody>
            </table>
            {status === 'loading' && stock.length === 0 && <p className={styles.empty} aria-live="polite">Loading stock…</p>}
            {status === 'ready' && stock.length === 0 && (
              <p className={styles.empty} role="status">
                {filtered ? 'No books match those filters.' : 'There are no books in the inventory yet.'}{' '}
                {filtered && <button type="button" onClick={() => { setSearchDraft(''); setFilters({ q: '', status: 'all', page: 1 }); }}>Clear filters</button>}
              </p>
            )}
          </div>
        )}

        {status === 'ready' && pagination && (
          <>
            <p className={styles.total}>{pagination.totalItems} {pagination.totalItems === 1 ? 'book' : 'books'}{filtered ? ' match' : ' in the inventory'}</p>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={page => { setFilters(current => ({ ...current, page })); tableHeading.current?.focus(); }} />
          </>
        )}
      </Container>
    </section>
  );
}
