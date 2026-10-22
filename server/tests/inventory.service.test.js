'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./helpers');
const { withTransaction } = require('../utils/transaction');
const {
  InsufficientStockError,
  checkAvailability,
  deductStock,
  restoreStock,
  setStock,
  adjustStock,
} = require('../services/inventory.service');

const ADMIN_ID = 1;

describe('inventory service', () => {
  let testDb;
  let pool;
  let isbnCounter = 0;

  before(async () => {
    testDb = await createTestDatabase({ seed: true });
    pool = testDb.pool;
  });
  after(() => testDb.drop());

  /** Insert a throw-away book so every test controls its own stock. */
  async function addBook(quantity, { title = 'Test Book', isActive = true } = {}) {
    isbnCounter += 1;
    const isbn = String(9780000000000 + isbnCounter);
    const [result] = await pool.query(
      'INSERT INTO books (isbn, title, author, category_id, price, is_active) VALUES (?, ?, ?, 1, 100.00, ?)',
      [isbn, title, 'Test Author', isActive]
    );
    await pool.query('INSERT INTO inventory (book_id, quantity) VALUES (?, ?)', [result.insertId, quantity]);
    return result.insertId;
  }

  async function stockOf(bookId) {
    const [[row]] = await pool.query('SELECT quantity FROM inventory WHERE book_id = ?', [bookId]);
    return row.quantity;
  }

  const buy = (items) => withTransaction(pool, (conn) => deductStock(conn, items));

  describe('checkAvailability', () => {
    it('is ok when every book has enough stock, and changes nothing', async () => {
      const a = await addBook(5);
      const b = await addBook(1);
      const result = await checkAvailability(pool, [
        { bookId: a, quantity: 5 },
        { bookId: b, quantity: 1 },
      ]);
      assert.deepEqual(result, { ok: true, shortages: [] });
      assert.equal(await stockOf(a), 5);
      assert.equal(await stockOf(b), 1);
    });

    it('reports every short book with a plain-language message', async () => {
      const few = await addBook(2, { title: 'Few Left' });
      const none = await addBook(0, { title: 'Sold Out' });
      const plenty = await addBook(10, { title: 'Plenty' });

      const { ok, shortages } = await checkAvailability(pool, [
        { bookId: few, quantity: 3 },
        { bookId: none, quantity: 1 },
        { bookId: plenty, quantity: 2 },
      ]);

      assert.equal(ok, false);
      assert.deepEqual(shortages, [
        { bookId: few, title: 'Few Left', requested: 3, available: 2, message: 'Only 2 copies of “Few Left” are available, but you chose 3.' },
        { bookId: none, title: 'Sold Out', requested: 1, available: 0, message: '“Sold Out” is out of stock.' },
      ]);
    });

    it('uses the singular when exactly one copy is left', async () => {
      const id = await addBook(1, { title: 'Last One' });
      const { shortages } = await checkAvailability(pool, [{ bookId: id, quantity: 2 }]);
      assert.equal(shortages[0].message, 'Only 1 copy of “Last One” is available, but you chose 2.');
    });

    it('treats a removed or unknown book as unavailable', async () => {
      const removed = await addBook(10, { title: 'Gone', isActive: false });
      const { ok, shortages } = await checkAvailability(pool, [
        { bookId: removed, quantity: 1 },
        { bookId: 999999, quantity: 1 },
      ]);
      assert.equal(ok, false);
      assert.deepEqual(
        shortages.map((s) => [s.bookId, s.available, s.message]),
        [
          [removed, 0, '“Gone” is no longer available.'],
          [999999, 0, 'A book in your cart is no longer available.'],
        ]
      );
    });

    it('merges repeated books before comparing with the stock', async () => {
      const id = await addBook(3);
      const { ok } = await checkAvailability(pool, [
        { bookId: id, quantity: 2 },
        { bookId: id, quantity: 2 },
      ]);
      assert.equal(ok, false);
    });

    it('rejects malformed input as a programming error', async () => {
      await assert.rejects(checkAvailability(pool, []), TypeError);
      await assert.rejects(checkAvailability(pool, [{ bookId: 1, quantity: 0 }]), TypeError);
      await assert.rejects(checkAvailability(pool, [{ bookId: 1, quantity: 1.5 }]), TypeError);
      await assert.rejects(checkAvailability(pool, [{ bookId: 'x', quantity: 1 }]), TypeError);
      await assert.rejects(checkAvailability(pool, null), TypeError);
    });
  });

  describe('deductStock', () => {
    it('removes the purchased copies', async () => {
      const a = await addBook(10);
      const b = await addBook(4);
      await buy([
        { bookId: a, quantity: 3 },
        { bookId: b, quantity: 4 },
      ]);
      assert.equal(await stockOf(a), 7);
      assert.equal(await stockOf(b), 0);
    });

    it('can take the very last copy', async () => {
      const id = await addBook(1);
      await buy([{ bookId: id, quantity: 1 }]);
      assert.equal(await stockOf(id), 0);
    });

    it('merges repeated books', async () => {
      const id = await addBook(5);
      await buy([
        { bookId: id, quantity: 2 },
        { bookId: id, quantity: 1 },
      ]);
      assert.equal(await stockOf(id), 2);
    });

    it('refuses to sell more than is in stock (BR-1) and leaves the stock untouched', async () => {
      const id = await addBook(2, { title: 'Scarce' });
      await assert.rejects(buy([{ bookId: id, quantity: 3 }]), (err) => {
        assert.ok(err instanceof InsufficientStockError);
        assert.equal(err.status, 409);
        assert.equal(err.code, 'INSUFFICIENT_STOCK');
        assert.equal(err.message, 'Only 2 copies of “Scarce” are available, but you chose 3.');
        return true;
      });
      assert.equal(await stockOf(id), 2);
    });

    it('is all or nothing: one short book stops the deduction of the others', async () => {
      const enough = await addBook(10, { title: 'Enough' });
      const short = await addBook(1, { title: 'Short' });
      const alsoShort = await addBook(0, { title: 'Also Short' });

      await assert.rejects(
        buy([
          { bookId: enough, quantity: 4 },
          { bookId: short, quantity: 2 },
          { bookId: alsoShort, quantity: 1 },
        ]),
        (err) => {
          assert.equal(err.code, 'INSUFFICIENT_STOCK');
          assert.equal(err.message, 'Some books are no longer available in the quantity you chose.');
          assert.deepEqual(
            err.details.map((d) => [d.bookId, d.requested, d.available]),
            [
              [short, 2, 1],
              [alsoShort, 1, 0],
            ]
          );
          return true;
        }
      );
      assert.equal(await stockOf(enough), 10);
      assert.equal(await stockOf(short), 1);
      assert.equal(await stockOf(alsoShort), 0);
    });

    it('undoes only its own work when the caller keeps the transaction open after a shortage', async () => {
      const enough = await addBook(10);
      const short = await addBook(1);
      const other = await addBook(5);

      await withTransaction(pool, async (conn) => {
        await deductStock(conn, [{ bookId: other, quantity: 2 }]); // earlier work in the same transaction
        await assert.rejects(
          deductStock(conn, [
            { bookId: enough, quantity: 4 },
            { bookId: short, quantity: 2 },
          ]),
          InsufficientStockError
        );
      });

      assert.equal(await stockOf(enough), 10, 'the failed deduction is undone');
      assert.equal(await stockOf(short), 1);
      assert.equal(await stockOf(other), 3, 'earlier work in the transaction is kept');
    });

    it('does not sell a removed book even if copies are left', async () => {
      const id = await addBook(5, { title: 'Withdrawn', isActive: false });
      await assert.rejects(buy([{ bookId: id, quantity: 1 }]), (err) => {
        assert.equal(err.code, 'INSUFFICIENT_STOCK');
        assert.equal(err.message, '“Withdrawn” is no longer available.');
        return true;
      });
      assert.equal(await stockOf(id), 5);
    });

    it('is rolled back together with the rest of the order if a later step fails', async () => {
      const id = await addBook(5);
      await assert.rejects(
        withTransaction(pool, async (conn) => {
          await deductStock(conn, [{ bookId: id, quantity: 2 }]);
          throw new Error('payment record could not be saved');
        }),
        /payment record/
      );
      assert.equal(await stockOf(id), 5);
    });

    it('fails with a stock error for a book that does not exist', async () => {
      await assert.rejects(buy([{ bookId: 999999, quantity: 1 }]), (err) => {
        assert.equal(err.code, 'INSUFFICIENT_STOCK');
        assert.equal(err.message, 'A book in your cart is no longer available.');
        return true;
      });
    });
  });

  describe('deductStock under concurrency (DB-3)', () => {
    it('lets exactly one of many simultaneous buyers take the last copy', async () => {
      const id = await addBook(1);
      const results = await Promise.allSettled(Array.from({ length: 15 }, () => buy([{ bookId: id, quantity: 1 }])));

      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter((r) => r.status === 'rejected');
      assert.equal(won.length, 1);
      assert.equal(lost.length, 14);
      for (const r of lost) assert.equal(r.reason.code, 'INSUFFICIENT_STOCK');
      assert.equal(await stockOf(id), 0);
    });

    it('never oversells: 40 buyers of 1 copy against a stock of 25 sell exactly 25', async () => {
      const id = await addBook(25);
      const results = await Promise.allSettled(Array.from({ length: 40 }, () => buy([{ bookId: id, quantity: 1 }])));
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 25);
      assert.equal(await stockOf(id), 0);
    });

    it('does not deadlock when orders list the same books in opposite orders', async () => {
      const a = await addBook(10);
      const b = await addBook(10);
      const results = await Promise.allSettled(
        Array.from({ length: 24 }, (_, i) =>
          buy(
            i % 2 === 0
              ? [
                  { bookId: a, quantity: 1 },
                  { bookId: b, quantity: 1 },
                ]
              : [
                  { bookId: b, quantity: 1 },
                  { bookId: a, quantity: 1 },
                ]
          )
        )
      );

      const failures = results.filter((r) => r.status === 'rejected');
      for (const f of failures) {
        assert.equal(f.reason.code, 'INSUFFICIENT_STOCK', `unexpected failure: ${f.reason.message}`);
      }
      assert.equal(results.length - failures.length, 10);
      assert.equal(await stockOf(a), 0);
      assert.equal(await stockOf(b), 0);
    });

    it('keeps a short order from taking stock that another order needs', async () => {
      const a = await addBook(3);
      const b = await addBook(0);
      // Order 1 wants a x3 + b x1 (will fail on b); order 2 wants a x3 and must still succeed.
      const [first, second] = await Promise.allSettled([
        buy([
          { bookId: a, quantity: 3 },
          { bookId: b, quantity: 1 },
        ]),
        buy([{ bookId: a, quantity: 3 }]),
      ]);
      assert.equal(first.status, 'rejected');
      assert.equal(second.status, 'fulfilled');
      assert.equal(await stockOf(a), 0);
    });
  });

  describe('restoreStock', () => {
    it('puts cancelled copies back', async () => {
      const a = await addBook(1);
      const b = await addBook(0);
      await withTransaction(pool, (conn) =>
        restoreStock(conn, [
          { bookId: a, quantity: 2 },
          { bookId: b, quantity: 3 },
        ])
      );
      assert.equal(await stockOf(a), 3);
      assert.equal(await stockOf(b), 3);
    });

    it('is the exact reverse of deductStock', async () => {
      const id = await addBook(7);
      const items = [{ bookId: id, quantity: 4 }];
      await buy(items);
      await withTransaction(pool, (conn) => restoreStock(conn, items));
      assert.equal(await stockOf(id), 7);
    });

    it('fails, and changes nothing, for a book without an inventory record', async () => {
      const id = await addBook(1);
      await assert.rejects(
        withTransaction(pool, (conn) =>
          restoreStock(conn, [
            { bookId: id, quantity: 1 },
            { bookId: 999999, quantity: 1 },
          ])
        ),
        /no inventory record/
      );
      assert.equal(await stockOf(id), 1);
    });
  });

  describe('setStock (stock-take)', () => {
    let bookId;
    beforeEach(async () => {
      bookId = await addBook(10);
    });

    const audit = async () => {
      const [rows] = await pool.query(
        'SELECT admin_id, quantity_before, quantity_after, reason FROM inventory_adjustments WHERE book_id = ? ORDER BY id',
        [bookId]
      );
      return rows;
    };

    it('sets the exact quantity and records who changed it, from what, to what', async () => {
      const result = await setStock(pool, { bookId, quantity: 42, adminId: ADMIN_ID, reason: 'Annual stock-take' });
      assert.deepEqual(result, { bookId, before: 10, after: 42 });
      assert.equal(await stockOf(bookId), 42);
      assert.deepEqual(await audit(), [
        { admin_id: ADMIN_ID, quantity_before: 10, quantity_after: 42, reason: 'Annual stock-take' },
      ]);
    });

    it('allows setting the stock to zero', async () => {
      await setStock(pool, { bookId, quantity: 0, adminId: ADMIN_ID });
      assert.equal(await stockOf(bookId), 0);
      assert.equal((await audit())[0].reason, null);
    });

    it('does not write an audit row when nothing changed', async () => {
      await setStock(pool, { bookId, quantity: 10, adminId: ADMIN_ID });
      assert.deepEqual(await audit(), []);
    });

    it('reports a book without an inventory record as not found', async () => {
      await assert.rejects(setStock(pool, { bookId: 999999, quantity: 1, adminId: ADMIN_ID }), (err) => {
        assert.equal(err.status, 404);
        return true;
      });
    });
  });

  describe('adjustStock (delivery, damage, returns)', () => {
    let bookId;
    beforeEach(async () => {
      bookId = await addBook(10);
    });

    it('adds copies and records the change', async () => {
      const result = await adjustStock(pool, { bookId, change: 15, adminId: ADMIN_ID, reason: 'Delivery' });
      assert.deepEqual(result, { bookId, before: 10, after: 25 });
      assert.equal(await stockOf(bookId), 25);
      const [[row]] = await pool.query('SELECT quantity_before, quantity_after, reason FROM inventory_adjustments WHERE book_id = ?', [bookId]);
      assert.deepEqual(row, { quantity_before: 10, quantity_after: 25, reason: 'Delivery' });
    });

    it('removes copies, down to exactly zero', async () => {
      await adjustStock(pool, { bookId, change: -10, adminId: ADMIN_ID });
      assert.equal(await stockOf(bookId), 0);
    });

    it('refuses to go below zero, with a clear message, and changes nothing', async () => {
      await assert.rejects(adjustStock(pool, { bookId, change: -11, adminId: ADMIN_ID }), (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, 'STOCK_BELOW_ZERO');
        assert.equal(err.message, 'Stock cannot go below zero: only 10 copies in stock, so 11 cannot be removed.');
        return true;
      });
      assert.equal(await stockOf(bookId), 10);
      const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM inventory_adjustments WHERE book_id = ?', [bookId]);
      assert.equal(n, 0);
    });

    it('refuses to exceed the maximum stock', async () => {
      await assert.rejects(adjustStock(pool, { bookId, change: 1000000, adminId: ADMIN_ID }), (err) => {
        assert.equal(err.status, 400);
        return true;
      });
      assert.equal(await stockOf(bookId), 10);
    });

    it('does not lose updates when administrators and customers act at the same time', async () => {
      // 10 in stock; 20 admin deliveries of +1 and 6 customer purchases of 1, all at once.
      const work = [
        ...Array.from({ length: 20 }, () => adjustStock(pool, { bookId, change: 1, adminId: ADMIN_ID })),
        ...Array.from({ length: 6 }, () => buy([{ bookId, quantity: 1 }])),
      ];
      const results = await Promise.allSettled(work);
      assert.deepEqual(results.filter((r) => r.status === 'rejected'), []);
      assert.equal(await stockOf(bookId), 10 + 20 - 6);

      const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM inventory_adjustments WHERE book_id = ?', [bookId]);
      assert.equal(n, 20);
    });
  });
});
