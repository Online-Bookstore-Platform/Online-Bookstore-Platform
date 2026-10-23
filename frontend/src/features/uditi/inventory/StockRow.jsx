import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../shared/api.js';
import { formatDateTime, statusClass, stockLabel } from '../shared/format.js';
import { adjustStock, setStock } from './api.js';
import { describeStockUpdate, validateStockChange } from './inventoryRules.js';
import styles from './Inventory.module.css';

/**
 * One book's stock, with an inline editor. The editor either adds/removes copies (safe while
 * customers are buying) or sets an exact count (a stock-take). The server decides: it locks
 * the row, never lets stock go below zero, and keeps an audit record of who changed what.
 */
export default function StockRow({ item, onUpdated, onSignedOut, onStale }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState('adjust');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState(null); // { field, message }
  const [busy, setBusy] = useState(false);
  const amountRef = useRef(null);

  useEffect(() => {
    if (editing) amountRef.current?.focus();
  }, [editing]);

  const open = () => {
    setEditing(true);
    setMode('adjust');
    setAmount('');
    setReason('');
    setProblem(null);
  };

  async function save(event) {
    event.preventDefault();
    const check = validateStockChange({ mode, amount, reason, current: item.quantity });
    if (!check.ok) return setProblem({ field: check.field, message: check.message });

    setBusy(true);
    setProblem(null);
    try {
      const updated = await (mode === 'set' ? setStock(item.bookId, check.body) : adjustStock(item.bookId, check.body));
      onUpdated(updated, describeStockUpdate(updated.title, item.quantity, updated.quantity));
      setEditing(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSignedOut();
      setProblem({ field: 'amount', message: error.message });
      // 409: the stock moved since this page loaded (a customer bought, or another administrator edited). Show the real number.
      if (error instanceof ApiError && error.status === 409) onStale?.();
    } finally {
      setBusy(false);
    }
  }

  const rowId = `stock-${item.bookId}`;
  const preview = (() => {
    const check = validateStockChange({ mode, amount, reason: '', current: item.quantity });
    return check.ok ? check.after : null;
  })();

  return (
    <>
      <tr className={item.isActive ? undefined : styles.removed}>
        <th scope="row">
          <strong>{item.title}</strong>
          <small>{item.author} · ISBN {item.isbn}</small>
          {!item.isActive && <small className={styles.removedTag}>Removed from the catalogue</small>}
        </th>
        <td><span className={`${styles.pill} ${styles[statusClass(item.stockStatus)] || ''}`}>{stockLabel(item.stockStatus)}</span></td>
        <td className={styles.quantity}>{item.quantity}</td>
        <td className={styles.updated}>{formatDateTime(item.updatedAt)}</td>
        <td className={styles.actions}>
          <button type="button" onClick={editing ? () => setEditing(false) : open} aria-expanded={editing} aria-controls={`${rowId}-editor`} aria-label={`${editing ? 'Close the editor for' : 'Update stock for'} ${item.title}`}>
            {editing ? 'Close' : 'Update'}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className={styles.editorRow}>
          <td colSpan={5}>
            <form className={styles.editor} id={`${rowId}-editor`} onSubmit={save} noValidate>
              <fieldset>
                <legend>How do you want to change “{item.title}”?</legend>
                <label><input type="radio" name={`${rowId}-mode`} checked={mode === 'adjust'} onChange={() => { setMode('adjust'); setProblem(null); }} /> Add or remove copies</label>
                <label><input type="radio" name={`${rowId}-mode`} checked={mode === 'set'} onChange={() => { setMode('set'); setProblem(null); }} /> Set the exact count</label>
              </fieldset>
              <div className={styles.editorFields}>
                <div>
                  <label htmlFor={`${rowId}-amount`}>{mode === 'set' ? 'Copies on the shelf' : 'Copies to add (or −number to remove)'}</label>
                  <input id={`${rowId}-amount`} ref={amountRef} inputMode={mode === 'set' ? 'numeric' : 'text'} autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} placeholder={mode === 'set' ? 'e.g. 40' : 'e.g. 10 or -2'} aria-invalid={problem?.field === 'amount' ? 'true' : undefined} aria-describedby={problem?.field === 'amount' ? `${rowId}-problem` : undefined} />
                </div>
                <div>
                  <label htmlFor={`${rowId}-reason`}>Reason (optional)</label>
                  <input id={`${rowId}-reason`} autoComplete="off" value={reason} onChange={event => setReason(event.target.value)} placeholder="Delivery, damaged, stock-take…" maxLength={200} aria-invalid={problem?.field === 'reason' ? 'true' : undefined} aria-describedby={problem?.field === 'reason' ? `${rowId}-problem` : undefined} />
                </div>
              </div>
              {problem && <p className={styles.problem} id={`${rowId}-problem`} role="alert">{problem.message}</p>}
              <div className={styles.editorActions}>
                <button className={styles.save} type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save stock'}</button>
                <span className={styles.preview} aria-live="polite">{preview !== null ? `Now: ${item.quantity} → ${preview}` : `Now: ${item.quantity}`}</span>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
