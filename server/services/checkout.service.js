'use strict';

/**
 * Checkout (SRS 5.4): the customer reviews the cart, gives delivery information
 * and sees the order summary BEFORE paying. Nothing here creates an order or
 * touches stock - that happens after payment (issues #8, #9, using
 * services/inventory.service.js).
 *
 * Prices are the books' current prices. The order module freezes them into
 * order_items when the order is created (BR-3).
 */

const { HttpError } = require('../utils/httpError');
const { lineTotal, sum } = require('../utils/money');
const checkout = require('../models/checkout.model');
const { checkAvailability } = require('./inventory.service');

const emptyCart = () => new HttpError(409, 'EMPTY_CART', 'Your cart is empty. Add a book before you check out.');

function toLineDto(row, problem) {
  return {
    bookId: row.book_id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    coverImageUrl: row.cover_image_url,
    category: { id: row.category_id, name: row.category_name },
    unitPrice: row.price,
    quantity: row.quantity,
    lineTotal: lineTotal(row.price, row.quantity),
    available: problem === null,
    problem,
  };
}

/**
 * Everything the checkout page shows.
 *
 * `canProceed` is true only when the cart has books, every book can be supplied
 * in the chosen quantity right now, and delivery details are saved. The payment
 * step must re-check stock itself - stock can change after this summary.
 */
async function getCheckoutSummary(db, customerId) {
  const cartId = await checkout.findCartId(db, customerId);
  const rows = cartId === null ? [] : await checkout.findCartLines(db, cartId);

  const stock =
    rows.length === 0
      ? { ok: true, shortages: [] }
      : await checkAvailability(db, rows.map((row) => ({ bookId: row.book_id, quantity: row.quantity })));
  const problems = new Map(stock.shortages.map((s) => [s.bookId, s.message]));

  const items = rows.map((row) => toLineDto(row, problems.get(row.book_id) ?? null));
  const delivery = cartId === null ? null : await checkout.findDelivery(db, cartId);
  const contact = delivery === null ? await checkout.findCustomerContact(db, customerId) : null;

  const subtotal = sum(items.map((item) => item.lineTotal));
  return {
    items,
    itemCount: items.reduce((count, item) => count + item.quantity, 0),
    // The SRS defines no delivery charge, tax or discount, so the total is the subtotal.
    totals: { subtotal, total: subtotal },
    stock,
    delivery,
    suggestedDelivery: contact,
    canProceed: items.length > 0 && stock.ok && delivery !== null,
  };
}

/** Save (or replace) the delivery details of the customer's cart. `input` is already validated. */
async function saveDeliveryDetails(db, customerId, input) {
  const cartId = await checkout.findCartId(db, customerId);
  if (cartId === null || (await checkout.findCartLines(db, cartId)).length === 0) throw emptyCart();

  await checkout.saveDelivery(db, cartId, input);
  return checkout.findDelivery(db, cartId);
}

module.exports = { getCheckoutSummary, saveDeliveryDetails };
