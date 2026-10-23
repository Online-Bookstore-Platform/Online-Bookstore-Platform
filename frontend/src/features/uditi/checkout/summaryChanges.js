import { formatPrice } from '../shared/format.js';

/**
 * Compare the summary the person was looking at with a fresh one from the server
 * (taken just before they continue to payment) and say, in plain words, what changed.
 * Prices and stock are always re-checked on the server; this makes any change visible
 * instead of silently charging a different total.
 *
 * @returns {{ changed: boolean, messages: string[] }}
 */
export function describeSummaryChanges(before, after) {
  const messages = [];
  const old = new Map(before.items.map(item => [item.bookId, item]));
  const current = new Map(after.items.map(item => [item.bookId, item]));

  for (const item of after.items) {
    const previous = old.get(item.bookId);
    if (previous && previous.unitPrice !== item.unitPrice) {
      messages.push(`“${item.title}” now costs ${formatPrice(item.unitPrice, after.totals.currency)} (it was ${formatPrice(previous.unitPrice, before.totals.currency)}).`);
    }
    if (previous && previous.quantity !== item.quantity) messages.push(`The quantity of “${item.title}” changed to ${item.quantity}.`);
    if (!previous) messages.push(`“${item.title}” was added to your cart.`);
    if (item.problem) messages.push(item.problem);
  }
  for (const previous of before.items) {
    if (!current.has(previous.bookId)) messages.push(`“${previous.title ?? 'A book'}” is no longer in your cart.`);
  }
  if (after.items.length === 0) messages.push('Your cart is empty.');

  return { changed: messages.length > 0, messages: [...new Set(messages)] };
}

/** Lines of the cart that cannot be bought as chosen (out of stock, removed, not enough copies). */
export const stockProblems = summary => summary.items.filter(item => item.problem).map(item => ({ bookId: item.bookId, message: item.problem }));
