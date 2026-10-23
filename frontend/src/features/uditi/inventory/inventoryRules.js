/*
 * What an administrator may type into the stock editor, checked before anything is sent.
 * The messages match the server's (backend/src/features/uditi/inventory), which still has
 * the final say - for example it re-checks "not below zero" against the CURRENT stock.
 */

export const MAX_STOCK = 1000000;
export const MAX_REASON_LENGTH = 200;

const copies = count => (count === 1 ? 'copy' : 'copies');
const formatted = number => number.toLocaleString('en-US');

/**
 * @param {{ mode: 'adjust' | 'set', amount: string, reason: string, current: number }} input
 * @returns {{ ok: true, body: object, after: number } | { ok: false, field: 'amount' | 'reason', message: string }}
 */
export function validateStockChange({ mode, amount, reason, current }) {
  const text = (amount ?? '').trim();
  const note = (reason ?? '').trim();
  if (note.length > MAX_REASON_LENGTH) return { ok: false, field: 'reason', message: `The reason is too long (up to ${MAX_REASON_LENGTH} characters).` };
  const withReason = body => (note ? { ...body, reason: note } : body);

  if (mode === 'set') {
    if (text === '') return { ok: false, field: 'amount', message: 'Enter the number of copies on the shelf.' };
    if (/^-/.test(text)) return { ok: false, field: 'amount', message: 'Quantity cannot be negative.' };
    if (!/^\d+$/.test(text)) return { ok: false, field: 'amount', message: 'Quantity must be a whole number.' };
    const quantity = Number(text);
    if (quantity > MAX_STOCK) return { ok: false, field: 'amount', message: `Quantity cannot be more than ${formatted(MAX_STOCK)}.` };
    return { ok: true, body: withReason({ quantity }), after: quantity };
  }

  if (text === '') return { ok: false, field: 'amount', message: 'Enter how many copies to add, or a minus sign and a number to remove.' };
  if (!/^[+-]?\d+$/.test(text)) return { ok: false, field: 'amount', message: 'Change must be a whole number such as 10 or -2.' };
  const change = Number(text);
  if (change === 0) return { ok: false, field: 'amount', message: 'Change cannot be zero.' };
  if (Math.abs(change) > MAX_STOCK) return { ok: false, field: 'amount', message: `Change cannot be more than ${formatted(MAX_STOCK)} copies.` };
  const after = current + change;
  if (after < 0) return { ok: false, field: 'amount', message: `Stock cannot go below zero: only ${current} ${copies(current)} in stock, so ${-change} cannot be removed.` };
  if (after > MAX_STOCK) return { ok: false, field: 'amount', message: `Stock cannot be more than ${formatted(MAX_STOCK)} copies.` };
  return { ok: true, body: withReason({ change }), after };
}

/** "Pride and Prejudice: 40 → 45 copies" */
export const describeStockUpdate = (title, before, after) => `Stock for “${title}” is now ${after} ${copies(after)} (was ${before}).`;

export const STATUS_FILTERS = [
  { value: 'all', label: 'All books' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
];
