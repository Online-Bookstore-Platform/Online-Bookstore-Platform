import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, loginPath } from '../../uditi/shared/api.js';
import { getCart, removeCartItem, updateCartItem } from '../api.js';
import styles from './Cart.module.css';

const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount ?? 0);

export default function CartPage() {
  const [cart, setCart] = useState(null);
  const [error, setError] = useState('');
  const [busyItem, setBusyItem] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function load(signal) {
    setLoading(true);
    setError('');
    try {
      setCart(await getCart(signal));
    } catch (requestError) {
      if (requestError.name === 'AbortError') return;
      if (requestError instanceof ApiError && requestError.status === 401) {
        navigate(loginPath('/cart'), { replace: true });
        return;
      }
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  async function changeQuantity(item, quantity) {
    setBusyItem(item.itemId);
    setError('');
    try {
      setCart(await updateCartItem(item.itemId, quantity));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) navigate(loginPath('/cart'), { replace: true });
      else setError(requestError.message);
    } finally {
      setBusyItem('');
    }
  }

  async function remove(item) {
    setBusyItem(item.itemId);
    setError('');
    try {
      setCart(await removeCartItem(item.itemId));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) navigate(loginPath('/cart'), { replace: true });
      else setError(requestError.message);
    } finally {
      setBusyItem('');
    }
  }

  if (loading) return <main className={styles.state} aria-live="polite"><p>Gathering your selected books…</p></main>;

  return <main className={styles.page}>
    <header className={styles.header}>
      <p className="eyebrow">Your collection</p>
      <h1>Keep the good ones close.</h1>
      <p>Review your choices before they find their way home.</p>
    </header>
    {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => load()}>Try again</button></div>}
    {!cart && error
      ? <section className={styles.empty}>
        <p className="eyebrow">Cart unavailable</p><h2>We couldn’t load your cart.</h2>
        <p className={styles.errorText}>{error}</p>
        <button className={styles.retry} type="button" onClick={() => load()}>Try again</button>
      </section>
      : cart && !cart.items.length
      ? <section className={styles.empty}>
        <p className="eyebrow">A fresh page</p><h2>Your cart is waiting for a good story.</h2>
        <p>Explore the shelves and add a book you’d like to keep.</p>
        <Link className={styles.primaryLink} to="/catalogue">Discover books <span aria-hidden="true">↗</span></Link>
      </section>
      : cart && <div className={styles.layout}>
        <section aria-label="Books in your cart">
          <div className={styles.cartHeading}><h2>Your selection</h2><span>{cart.itemCount} {cart.itemCount === 1 ? 'book' : 'books'}</span></div>
          <ul className={styles.items}>
            {cart.items.map(item => <li className={styles.item} key={item.itemId}>
              <div className={styles.cover}>
                {item.coverImageUrl && <img src={item.coverImageUrl} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }} />}
                <span className={styles.coverFallback} aria-hidden="true">{item.title?.slice(0, 1) ?? 'F'}</span>
              </div>
              <div className={styles.details}>
                <h3><Link to={`/books/${item.bookId}`}>{item.title}</Link></h3>
                <p className={styles.author}>{item.author}</p>
                <p className={styles.unit}>{money(item.unitPrice)} <span>each</span></p>
                {item.problem && <p className={styles.problem} role="status">{item.problem} Adjust the quantity or remove it to continue.</p>}
                <div className={styles.actions}>
                  <div className={styles.quantity} aria-label={`Quantity for ${item.title}`}>
                    <button type="button" aria-label={`Decrease ${item.title} quantity`} disabled={busyItem === item.itemId || item.quantity <= 1} onClick={() => changeQuantity(item, item.quantity - 1)}>−</button>
                    <span aria-live="polite">{item.quantity}</span>
                    <button type="button" aria-label={`Increase ${item.title} quantity`} disabled={busyItem === item.itemId || !item.available} onClick={() => changeQuantity(item, item.quantity + 1)}>+</button>
                  </div>
                  <button className={styles.remove} type="button" disabled={busyItem === item.itemId} onClick={() => remove(item)}>{busyItem === item.itemId ? 'Updating…' : 'Remove'}</button>
                </div>
              </div>
              <p className={styles.lineTotal}>{money(item.lineTotal)}</p>
            </li>)}
          </ul>
          <Link className={styles.continueShopping} to="/catalogue">Continue exploring <span aria-hidden="true">↗</span></Link>
        </section>
        <aside className={styles.summary} aria-label="Cart summary">
          <p className="eyebrow">At a glance</p>
          <h2>Your total</h2>
          <dl><div><dt>Subtotal</dt><dd>{money(cart.totals?.subtotal)}</dd></div><div className={styles.grand}><dt>Total</dt><dd>{money(cart.totals?.subtotal)}</dd></div></dl>
          <p className={styles.fine}>Delivery and payment details are confirmed at checkout. Availability is checked again before an order is placed.</p>
          <Link className={styles.checkout} to="/checkout">Continue to checkout <span aria-hidden="true">↗</span></Link>
        </aside>
      </div>}
  </main>;
}
