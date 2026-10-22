'use strict';

/**
 * Stock rules for the Online Bookstore (SRS 5.7, BR-1, DB-3).
 *
 * How the purchase flow should use this module:
 *
 *   1. Checkout (before payment)   -> checkAvailability(pool, items)
 *        Read-only. Tells the customer early which books cannot be bought in the
 *        quantity they chose. Stock can still change before they pay.
 *
 *   2. Order creation (after the payment gateway confirmed the payment), inside
 *      ONE transaction together with creating the order and its items:
 *
 *        await withTransaction(pool, async (conn) => {
 *          await deductStock(conn, items);      // throws InsufficientStockError
 *          ... insert order, order items, payment ...
 *        });
 *
 *      deductStock removes the stock atomically: a copy can only be taken if it is
 *      still there, so two customers can never both buy the last copy. If any book
 *      is short, nothing is deducted and the transaction should be rolled back
 *      (throwing is enough when using withTransaction).
 *
 *   3. Order cancelled before it ships (BR-2) -> restoreStock(conn, items)
 *
 * `items` is always [{ bookId, quantity }]; repeated books are merged.
 */

const { HttpError, badRequest, notFound } = require('../utils/httpError');
const { withTransaction } = require('../utils/transaction');
const inventory = require('../models/inventory.model');

const MAX_STOCK = 1000000;

const copies = (n) => (n === 1 ? 'copy' : 'copies');

/** One book that cannot be supplied in the requested quantity. */
function describeShortage({ bookId, title, requested, available, active }) {
  let message;
  if (title === null) message = 'A book in your cart is no longer available.';
  else if (!active) message = `“${title}” is no longer available.`;
  else if (available === 0) message = `“${title}” is out of stock.`;
  else
    message = `Only ${available} ${copies(available)} of “${title}” ${available === 1 ? 'is' : 'are'} available, but you chose ${requested}.`;
  return { bookId, title, requested, available, message };
}

/** 409: at least one book does not have enough stock. `details` lists each one. */
class InsufficientStockError extends HttpError {
  constructor(shortages) {
    super(
      409,
      'INSUFFICIENT_STOCK',
      shortages.length === 1
        ? shortages[0].message
        : 'Some books are no longer available in the quantity you chose.',
      shortages
    );
    this.name = 'InsufficientStockError';
    this.shortages = shortages;
  }
}

/** Validate, merge duplicates and sort by book id (a fixed locking order avoids deadlocks). */
function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new TypeError('items must be a non-empty array');

  const merged = new Map();
  for (const item of items) {
    const { bookId, quantity } = item ?? {};
    if (!Number.isInteger(bookId) || bookId < 1) throw new TypeError(`invalid bookId: ${bookId}`);
    if (!Number.isInteger(quantity) || quantity < 1) throw new TypeError(`invalid quantity for book ${bookId}: ${quantity}`);
    merged.set(bookId, (merged.get(bookId) ?? 0) + quantity);
  }
  return [...merged.entries()].map(([bookId, quantity]) => ({ bookId, quantity })).sort((a, b) => a.bookId - b.bookId);
}

/** Work out the shortage details for the given lines from current stock. */
async function findShortages(db, lines, { lock = false } = {}) {
  const rows = await inventory.findAvailability(
    db,
    lines.map((line) => line.bookId),
    { lock }
  );
  const byId = new Map(rows.map((row) => [row.id, row]));

  const shortages = [];
  for (const { bookId, quantity: requested } of lines) {
    const row = byId.get(bookId);
    if (!row) {
      shortages.push(describeShortage({ bookId, title: null, requested, available: 0, active: false }));
    } else if (!row.is_active) {
      shortages.push(describeShortage({ bookId, title: row.title, requested, available: 0, active: false }));
    } else if (row.quantity < requested) {
      shortages.push(describeShortage({ bookId, title: row.title, requested, available: row.quantity, active: true }));
    }
  }
  return shortages;
}

/**
 * Read-only check used at checkout: can every item be supplied right now?
 * Books that were removed from the catalogue count as unavailable.
 *
 * @returns {Promise<{ ok: boolean, shortages: Array<{bookId, title, requested, available, message}> }>}
 */
async function checkAvailability(db, items) {
  const shortages = await findShortages(db, normalizeItems(items));
  return { ok: shortages.length === 0, shortages };
}

/**
 * Remove the purchased copies from stock. MUST run inside the caller's transaction.
 * All or nothing: if any book is short, the whole deduction is undone and an
 * InsufficientStockError listing every short book is thrown.
 *
 * @param {import('mysql2/promise').PoolConnection} conn  a connection with an open transaction
 */
async function deductStock(conn, items) {
  const lines = normalizeItems(items);

  await conn.query('SAVEPOINT deduct_stock');
  const failed = [];
  for (const line of lines) {
    if (!(await inventory.decrementIfEnough(conn, line.bookId, line.quantity))) failed.push(line);
  }

  if (failed.length === 0) {
    await conn.query('RELEASE SAVEPOINT deduct_stock');
    return;
  }

  await conn.query('ROLLBACK TO SAVEPOINT deduct_stock');
  // The failed UPDATEs keep their rows locked until the transaction ends, so this re-read
  // sees the same numbers that made them fail. The fallback is only a safety net.
  let shortages = await findShortages(conn, failed, { lock: true });
  if (shortages.length === 0) {
    shortages = failed.map(({ bookId, quantity }) =>
      describeShortage({ bookId, title: null, requested: quantity, available: 0, active: false })
    );
  }
  throw new InsufficientStockError(shortages);
}

/**
 * Put copies back, e.g. when an order is cancelled before it ships. MUST run inside
 * the caller's transaction.
 */
async function restoreStock(conn, items) {
  for (const { bookId, quantity } of normalizeItems(items)) {
    if (!(await inventory.increment(conn, bookId, quantity))) {
      throw new Error(`Cannot restore stock: book ${bookId} has no inventory record.`);
    }
  }
}

/**
 * Administrator: set the stock of a book to an exact number (a stock-take).
 * Prefer adjustStock while the shop is selling - an absolute number overwrites
 * any sale made since the administrator counted the shelves.
 */
async function setStock(pool, { bookId, quantity, adminId, reason }) {
  return withTransaction(pool, async (conn) => {
    const before = await inventory.lockQuantity(conn, bookId);
    if (before === null) throw notFound('We could not find that book in the inventory.');

    if (before !== quantity) {
      await inventory.writeQuantity(conn, bookId, quantity);
      await inventory.recordAdjustment(conn, { bookId, adminId, before, after: quantity, reason });
    }
    return { bookId, before, after: quantity };
  });
}

/**
 * Administrator: add (positive) or remove (negative) copies - deliveries, damaged
 * stock, returns. Safe while sales are happening, and never goes below zero.
 */
async function adjustStock(pool, { bookId, change, adminId, reason }) {
  return withTransaction(pool, async (conn) => {
    const before = await inventory.lockQuantity(conn, bookId);
    if (before === null) throw notFound('We could not find that book in the inventory.');

    const after = before + change;
    if (after < 0) {
      throw new HttpError(
        409,
        'STOCK_BELOW_ZERO',
        `Stock cannot go below zero: only ${before} ${copies(before)} in stock, so ${-change} cannot be removed.`
      );
    }
    if (after > MAX_STOCK) {
      throw badRequest(`Stock cannot be more than ${MAX_STOCK.toLocaleString('en-US')} copies.`);
    }

    await inventory.writeQuantity(conn, bookId, after);
    await inventory.recordAdjustment(conn, { bookId, adminId, before, after, reason });
    return { bookId, before, after };
  });
}

module.exports = {
  InsufficientStockError,
  normalizeItems,
  checkAvailability,
  deductStock,
  restoreStock,
  setStock,
  adjustStock,
};
