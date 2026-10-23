/**
 * Checkout (SRS 5.4): the customer reviews the cart, gives delivery information and sees
 * the order summary BEFORE paying. Nothing here creates an order, touches payments or
 * changes stock - the order and payment features do that, using inventory.service.js.
 *
 * The cart comes from the cart feature through a cart reader (see cart.reader.js). Prices
 * and availability are always re-read from the database, so a stale or tampered cart can
 * never produce a wrong total (BR-1, BR-3).
 */

import { HttpError, unavailableDependency } from '../shared/errors.js';
import { lineTotal, sum } from '../shared/money.js';
import { checkAvailability, normalizeItems } from '../inventory/inventory.service.js';
import * as checkout from './checkout.repository.js';

const CURRENCY = 'INR';

/** Cart lines with repeated books merged, in the order the cart listed them. */
function mergeLines(lines) {
  const merged = new Map();
  for (const line of normalizeItems(lines)) merged.set(line.bookId, line.quantity);
  const order = [];
  for (const { bookId } of lines) {
    const id = Number(bookId);
    if (merged.has(id) && !order.includes(id)) order.push(id);
  }
  return order.map(bookId => ({ bookId, quantity: merged.get(bookId) }));
}

async function readCart(cartReader, userId) {
  if (!cartReader?.getItems) throw unavailableDependency('Checkout cannot read your cart because the cart service is not connected yet.');
  const items = await cartReader.getItems(userId);
  if (!Array.isArray(items)) throw new HttpError(502, 'CART_INVALID', 'The cart service returned data checkout cannot use.');
  if (items.length === 0) return [];
  try {
    return mergeLines(items);
  } catch {
    throw new HttpError(502, 'CART_INVALID', 'The cart service returned data checkout cannot use.');
  }
}

/**
 * Everything the checkout page shows.
 *
 * `canProceed` is true only when the cart has books, every book can be supplied in the
 * chosen quantity right now, and delivery details are saved. The payment step must check
 * stock again - it can change after this summary.
 */
export async function getCheckoutSummary({ pool, cartReader }, user) {
  const lines = await readCart(cartReader, user.id);

  const books = new Map((await checkout.findBooksByIds(pool, lines.map(line => line.bookId))).map(book => [book.id, book]));
  const stock = lines.length === 0 ? { ok: true, shortages: [] } : await checkAvailability(pool, lines);
  const problems = new Map(stock.shortages.map(shortage => [shortage.bookId, shortage.message]));

  const items = lines.map(({ bookId, quantity }) => {
    const book = books.get(bookId);
    const problem = problems.get(bookId) ?? null;
    return {
      bookId,
      title: book?.title ?? null,
      author: book?.author ?? null,
      isbn: book?.isbn ?? null,
      category: book?.category_name ?? null,
      coverImageUrl: book?.cover_image_url ?? null,
      unitPrice: book?.price ?? 0,
      quantity,
      lineTotal: book ? lineTotal(book.price, quantity) : 0,
      available: problem === null,
      problem,
    };
  });

  const delivery = await checkout.findDelivery(pool, user.id);
  const suggestedDelivery = delivery ? null : await checkout.findAccountContact(pool, user.id);

  const subtotal = sum(items.map(item => item.lineTotal));
  return {
    items,
    itemCount: items.reduce((count, item) => count + item.quantity, 0),
    // The SRS defines no delivery charge, tax or discount, so the total is the subtotal.
    totals: { subtotal, total: subtotal, currency: CURRENCY },
    stock,
    delivery,
    suggestedDelivery,
    canProceed: items.length > 0 && stock.ok && delivery !== null,
  };
}

/** Save (or replace) the user's delivery details. `details` must already be validated. */
export async function saveDeliveryDetails({ pool, cartReader }, user, details) {
  if ((await readCart(cartReader, user.id)).length === 0) {
    throw new HttpError(409, 'EMPTY_CART', 'Your cart is empty. Add a book before you check out.');
  }
  await checkout.saveDelivery(pool, user.id, details);
  return checkout.findDelivery(pool, user.id);
}
