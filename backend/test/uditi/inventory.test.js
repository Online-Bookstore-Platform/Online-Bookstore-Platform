import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFixtures, createTestDatabase, databaseTests, startTestServer } from './helpers.js';
import { withTransaction } from '../../src/features/uditi/shared/transaction.js';
import { LOW_STOCK_THRESHOLD, stockStatus } from '../../src/features/uditi/inventory/stock.js';
import {
  InsufficientStockError,
  adjustStock,
  checkAvailability,
  deductStock,
  getAvailability,
  normalizeItems,
  restoreStock,
  setStock,
} from '../../src/features/uditi/inventory/inventory.service.js';
import {
  parseAdjustStockBody,
  parseAvailabilityQuery,
  parseBookId,
  parseSetStockBody,
  parseValidateBody,
} from '../../src/features/uditi/inventory/inventory.validation.js';

// Seed users: 1 = admin, 2 = Asha (customer), 3 = Ravi (customer)
const ADMIN = 1;
const CUSTOMER = 2;

describe('stock labels and input rules (unit)', () => {
  it('labels stock as out of stock, low stock or in stock', () => {
    assert.equal(stockStatus(0), 'out_of_stock');
    assert.equal(stockStatus(-3), 'out_of_stock');
    assert.equal(stockStatus(1), 'low_stock');
    assert.equal(stockStatus(LOW_STOCK_THRESHOLD), 'low_stock');
    assert.equal(stockStatus(LOW_STOCK_THRESHOLD + 1), 'in_stock');
  });

  it('merges repeated books, accepts digit-string ids and sorts by id (a fixed locking order)', () => {
    assert.deepEqual(
      normalizeItems([{ bookId: 9, quantity: 1 }, { bookId: '3', quantity: 2 }, { bookId: 9, quantity: 4 }]),
      [{ bookId: 3, quantity: 2 }, { bookId: 9, quantity: 5 }]
    );
  });

  it('rejects malformed items as a programming error', () => {
    for (const bad of [[], null, undefined, [null], [{ bookId: 1, quantity: 0 }], [{ bookId: 1, quantity: -2 }], [{ bookId: 1, quantity: 1.5 }], [{ bookId: 'x', quantity: 1 }], [{ bookId: 0, quantity: 1 }], [{ quantity: 1 }]]) {
      assert.throws(() => normalizeItems(bad), TypeError, JSON.stringify(bad));
    }
  });

  it('validates book ids, stock bodies and availability queries', () => {
    assert.equal(parseBookId('12'), 12);
    for (const bad of ['0', '-1', '1.5', 'abc', '1e3', '', undefined]) assert.throws(() => parseBookId(bad), error => error.status === 400, String(bad));

    assert.deepEqual(parseSetStockBody({ quantity: 0, reason: '  count  ' }), { quantity: 0, reason: 'count' });
    for (const bad of [{ quantity: -1 }, { quantity: 1.5 }, { quantity: '5' }, {}, null, [], { quantity: 1000001 }]) assert.throws(() => parseSetStockBody(bad), error => error.status === 400, JSON.stringify(bad));

    assert.deepEqual(parseAdjustStockBody({ change: -4 }), { change: -4, reason: undefined });
    for (const bad of [{ change: 0 }, { change: 'x' }, { change: 0.5 }, {}]) assert.throws(() => parseAdjustStockBody(bad), error => error.status === 400, JSON.stringify(bad));

    assert.deepEqual(parseAvailabilityQuery({ bookIds: '3,1,3' }), [3, 1]);
    for (const bad of [{}, { bookIds: '1,,2' }, { bookIds: 'a' }, { bookIds: ['1', '2'] }, { bookIds: Array.from({ length: 51 }, (_, i) => i + 1).join(',') }]) {
      assert.throws(() => parseAvailabilityQuery(bad), error => error.status === 400, JSON.stringify(bad));
    }

    assert.deepEqual(parseValidateBody({ items: [{ bookId: '4', quantity: 2 }] }), [{ bookId: 4, quantity: 2 }]);
    for (const bad of [{}, { items: [] }, { items: [{ bookId: 1, quantity: 0 }] }, { items: [{ bookId: 1, quantity: -1 }] }, { items: [{ bookId: 1, quantity: 1.2 }] }, { items: [{ quantity: 1 }] }, { items: 'x' }, null]) {
      assert.throws(() => parseValidateBody(bad), error => error.status === 400, JSON.stringify(bad));
    }
  });
});

describe('inventory service (#10)', databaseTests, () => {
  let testDb;
  let pool;
  let f;

  before(async () => {
    testDb = await createTestDatabase({ seed: true });
    pool = testDb.pool;
    f = createFixtures(pool);
  });
  after(() => testDb.drop());

  /** A throw-away book so every test controls its own stock. */
  const addBook = (quantity, { title = 'Test Book', isActive = true } = {}) =>
    f.addBook({ quantity, title, category_id: 1, is_active: isActive ? 1 : 0, price: 100 });
  const stockOf = bookId => f.stockOf(bookId);
  const buy = items => withTransaction(pool, connection => deductStock(connection, items));

  describe('checkAvailability', () => {
    it('is ok when every book has enough stock, and changes nothing', async () => {
      const a = await addBook(5);
      const b = await addBook(1);
      assert.deepEqual(await checkAvailability(pool, [{ bookId: a, quantity: 5 }, { bookId: b, quantity: 1 }]), { ok: true, shortages: [] });
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
      const { ok, shortages } = await checkAvailability(pool, [{ bookId: removed, quantity: 1 }, { bookId: 999999, quantity: 1 }]);
      assert.equal(ok, false);
      assert.deepEqual(shortages.map(s => [s.bookId, s.available, s.message]), [
        [removed, 0, '“Gone” is no longer available.'],
        [999999, 0, 'A book in your cart is no longer available.'],
      ]);
    });

    it('treats a book without an inventory record as out of stock', async () => {
      const id = await f.addBook({ quantity: null, title: 'No Record', category_id: 1 });
      const { shortages } = await checkAvailability(pool, [{ bookId: id, quantity: 1 }]);
      assert.equal(shortages[0].message, '“No Record” is out of stock.');
    });

    it('merges repeated books before comparing with the stock', async () => {
      const id = await addBook(3);
      assert.equal((await checkAvailability(pool, [{ bookId: id, quantity: 2 }, { bookId: id, quantity: 2 }])).ok, false);
    });

    it('rejects malformed input as a programming error', async () => {
      await assert.rejects(checkAvailability(pool, []), TypeError);
      await assert.rejects(checkAvailability(pool, [{ bookId: 1, quantity: 0 }]), TypeError);
      await assert.rejects(checkAvailability(pool, [{ bookId: 1, quantity: 1.5 }]), TypeError);
      await assert.rejects(checkAvailability(pool, [{ bookId: 'x', quantity: 1 }]), TypeError);
      await assert.rejects(checkAvailability(pool, null), TypeError);
    });
  });

  describe('getAvailability (labels for customers)', () => {
    it('gives labels, never quantities, and marks unknown or removed books unavailable', async () => {
      const plenty = await addBook(50);
      const low = await addBook(2);
      const none = await addBook(0);
      const removed = await addBook(9, { isActive: false });
      const labels = await getAvailability(pool, [plenty, low, none, removed, 999999]);
      assert.deepEqual(labels, [
        { bookId: plenty, stockStatus: 'in_stock', available: true },
        { bookId: low, stockStatus: 'low_stock', available: true },
        { bookId: none, stockStatus: 'out_of_stock', available: false },
        { bookId: removed, stockStatus: 'out_of_stock', available: false },
        { bookId: 999999, stockStatus: 'out_of_stock', available: false },
      ]);
    });
  });

  describe('deductStock', () => {
    it('removes the purchased copies', async () => {
      const a = await addBook(10);
      const b = await addBook(4);
      await buy([{ bookId: a, quantity: 3 }, { bookId: b, quantity: 4 }]);
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
      await buy([{ bookId: id, quantity: 2 }, { bookId: id, quantity: 1 }]);
      assert.equal(await stockOf(id), 2);
    });

    it('refuses to sell more than is in stock (BR-1) and leaves the stock untouched', async () => {
      const id = await addBook(2, { title: 'Scarce' });
      await assert.rejects(buy([{ bookId: id, quantity: 3 }]), error => {
        assert.ok(error instanceof InsufficientStockError);
        assert.equal(error.status, 409);
        assert.equal(error.code, 'INSUFFICIENT_STOCK');
        assert.equal(error.message, 'Only 2 copies of “Scarce” are available, but you chose 3.');
        return true;
      });
      assert.equal(await stockOf(id), 2);
    });

    it('is all or nothing: one short book stops the deduction of the others', async () => {
      const enough = await addBook(10, { title: 'Enough' });
      const short = await addBook(1, { title: 'Short' });
      const alsoShort = await addBook(0, { title: 'Also Short' });

      await assert.rejects(buy([{ bookId: enough, quantity: 4 }, { bookId: short, quantity: 2 }, { bookId: alsoShort, quantity: 1 }]), error => {
        assert.equal(error.code, 'INSUFFICIENT_STOCK');
        assert.equal(error.message, 'Some books are no longer available in the quantity you chose.');
        assert.deepEqual(error.details.map(d => [d.bookId, d.requested, d.available]), [[short, 2, 1], [alsoShort, 1, 0]]);
        return true;
      });
      assert.equal(await stockOf(enough), 10);
      assert.equal(await stockOf(short), 1);
      assert.equal(await stockOf(alsoShort), 0);
    });

    it('undoes only its own work when the caller keeps the transaction open after a shortage', async () => {
      const enough = await addBook(10);
      const short = await addBook(1);
      const other = await addBook(5);

      await withTransaction(pool, async connection => {
        await deductStock(connection, [{ bookId: other, quantity: 2 }]); // earlier work in the same transaction
        await assert.rejects(deductStock(connection, [{ bookId: enough, quantity: 4 }, { bookId: short, quantity: 2 }]), InsufficientStockError);
      });

      assert.equal(await stockOf(enough), 10, 'the failed deduction is undone');
      assert.equal(await stockOf(short), 1);
      assert.equal(await stockOf(other), 3, 'earlier work in the transaction is kept');
    });

    it('does not sell a removed book even if copies are left', async () => {
      const id = await addBook(5, { title: 'Withdrawn', isActive: false });
      await assert.rejects(buy([{ bookId: id, quantity: 1 }]), error => {
        assert.equal(error.code, 'INSUFFICIENT_STOCK');
        assert.equal(error.message, '“Withdrawn” is no longer available.');
        return true;
      });
      assert.equal(await stockOf(id), 5);
    });

    it('is rolled back together with the rest of the order if a later step fails', async () => {
      const id = await addBook(5);
      await assert.rejects(
        withTransaction(pool, async connection => {
          await deductStock(connection, [{ bookId: id, quantity: 2 }]);
          throw new Error('payment record could not be saved');
        }),
        /payment record/
      );
      assert.equal(await stockOf(id), 5);
    });

    it('fails with a stock error for a book that does not exist', async () => {
      await assert.rejects(buy([{ bookId: 999999, quantity: 1 }]), error => {
        assert.equal(error.code, 'INSUFFICIENT_STOCK');
        assert.equal(error.message, 'A book in your cart is no longer available.');
        return true;
      });
    });

    it('rejects invalid quantities before touching the database', async () => {
      const id = await addBook(5);
      for (const quantity of [0, -1, 1.5, '2', NaN]) await assert.rejects(buy([{ bookId: id, quantity }]), TypeError);
      assert.equal(await stockOf(id), 5);
    });
  });

  describe('deductStock under concurrency (DB-3)', () => {
    it('lets exactly one of many simultaneous buyers take the last copy', async () => {
      const id = await addBook(1);
      const results = await Promise.allSettled(Array.from({ length: 15 }, () => buy([{ bookId: id, quantity: 1 }])));

      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const lost = results.filter(r => r.status === 'rejected');
      assert.equal(lost.length, 14);
      for (const r of lost) assert.equal(r.reason.code, 'INSUFFICIENT_STOCK');
      assert.equal(await stockOf(id), 0);
    });

    it('never oversells: 40 buyers of 1 copy against a stock of 25 sell exactly 25', async () => {
      const id = await addBook(25);
      const results = await Promise.allSettled(Array.from({ length: 40 }, () => buy([{ bookId: id, quantity: 1 }])));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 25);
      assert.equal(await stockOf(id), 0);
    });

    it('does not deadlock when orders list the same books in opposite orders', async () => {
      const a = await addBook(10);
      const b = await addBook(10);
      const forwards = [{ bookId: a, quantity: 1 }, { bookId: b, quantity: 1 }];
      const backwards = [{ bookId: b, quantity: 1 }, { bookId: a, quantity: 1 }];
      const results = await Promise.allSettled(Array.from({ length: 24 }, (_, i) => buy(i % 2 === 0 ? forwards : backwards)));

      const failures = results.filter(r => r.status === 'rejected');
      for (const failure of failures) assert.equal(failure.reason.code, 'INSUFFICIENT_STOCK', `unexpected failure: ${failure.reason.message}`);
      assert.equal(results.length - failures.length, 10);
      assert.equal(await stockOf(a), 0);
      assert.equal(await stockOf(b), 0);
    });

    it('keeps a short order from taking stock that another order needs', async () => {
      const a = await addBook(3);
      const b = await addBook(0);
      // Order 1 wants a x3 + b x1 (fails on b); order 2 wants a x3 and must still succeed.
      const [first, second] = await Promise.allSettled([
        buy([{ bookId: a, quantity: 3 }, { bookId: b, quantity: 1 }]),
        buy([{ bookId: a, quantity: 3 }]),
      ]);
      assert.equal(first.status, 'rejected');
      assert.equal(second.status, 'fulfilled');
      assert.equal(await stockOf(a), 0);
    });

    it('the database itself refuses negative stock even if application code is wrong', async () => {
      const id = await addBook(2);
      await assert.rejects(pool.query('UPDATE inventory SET quantity = quantity - 3 WHERE book_id = ?', [id]), error => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED');
      assert.equal(await stockOf(id), 2);
    });
  });

  describe('restoreStock', () => {
    it('puts cancelled copies back', async () => {
      const a = await addBook(1);
      const b = await addBook(0);
      await withTransaction(pool, connection => restoreStock(connection, [{ bookId: a, quantity: 2 }, { bookId: b, quantity: 3 }]));
      assert.equal(await stockOf(a), 3);
      assert.equal(await stockOf(b), 3);
    });

    it('is the exact reverse of deductStock', async () => {
      const id = await addBook(7);
      const items = [{ bookId: id, quantity: 4 }];
      await buy(items);
      await withTransaction(pool, connection => restoreStock(connection, items));
      assert.equal(await stockOf(id), 7);
    });

    it('fails, and changes nothing, for a book without an inventory record', async () => {
      const id = await addBook(1);
      await assert.rejects(
        withTransaction(pool, connection => restoreStock(connection, [{ bookId: id, quantity: 1 }, { bookId: 999999, quantity: 1 }])),
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
      const [rows] = await pool.query('SELECT admin_id, quantity_before, quantity_after, reason FROM inventory_adjustments WHERE book_id = ? ORDER BY id', [bookId]);
      return rows;
    };

    it('sets the exact quantity and records who changed it, from what, to what', async () => {
      assert.deepEqual(await setStock(pool, { bookId, quantity: 42, adminId: ADMIN, reason: 'Annual stock-take' }), { bookId, before: 10, after: 42 });
      assert.equal(await stockOf(bookId), 42);
      assert.deepEqual(await audit(), [{ admin_id: ADMIN, quantity_before: 10, quantity_after: 42, reason: 'Annual stock-take' }]);
    });

    it('allows setting the stock to zero', async () => {
      await setStock(pool, { bookId, quantity: 0, adminId: ADMIN });
      assert.equal(await stockOf(bookId), 0);
      assert.equal((await audit())[0].reason, null);
    });

    it('does not write an audit row when nothing changed', async () => {
      await setStock(pool, { bookId, quantity: 10, adminId: ADMIN });
      assert.deepEqual(await audit(), []);
    });

    it('reports a book without an inventory record as not found', async () => {
      await assert.rejects(setStock(pool, { bookId: 999999, quantity: 1, adminId: ADMIN }), error => error.status === 404 && error.code === 'BOOK_NOT_FOUND');
    });
  });

  describe('adjustStock (delivery, damage, returns)', () => {
    let bookId;
    beforeEach(async () => {
      bookId = await addBook(10);
    });

    it('adds copies and records the change', async () => {
      assert.deepEqual(await adjustStock(pool, { bookId, change: 15, adminId: ADMIN, reason: 'Delivery' }), { bookId, before: 10, after: 25 });
      assert.equal(await stockOf(bookId), 25);
      const [[row]] = await pool.query('SELECT quantity_before, quantity_after, reason FROM inventory_adjustments WHERE book_id = ?', [bookId]);
      assert.deepEqual(row, { quantity_before: 10, quantity_after: 25, reason: 'Delivery' });
    });

    it('removes copies, down to exactly zero', async () => {
      await adjustStock(pool, { bookId, change: -10, adminId: ADMIN });
      assert.equal(await stockOf(bookId), 0);
    });

    it('refuses to go below zero, with a clear message, and changes nothing', async () => {
      await assert.rejects(adjustStock(pool, { bookId, change: -11, adminId: ADMIN }), error => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'STOCK_BELOW_ZERO');
        assert.equal(error.message, 'Stock cannot go below zero: only 10 copies in stock, so 11 cannot be removed.');
        return true;
      });
      assert.equal(await stockOf(bookId), 10);
      const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM inventory_adjustments WHERE book_id = ?', [bookId]);
      assert.equal(n, 0);
    });

    it('refuses to exceed the maximum stock', async () => {
      await assert.rejects(adjustStock(pool, { bookId, change: 1000000, adminId: ADMIN }), error => error.status === 400 && error.code === 'STOCK_TOO_HIGH');
      assert.equal(await stockOf(bookId), 10);
    });

    it('does not lose updates when administrators and customers act at the same time', async () => {
      // 10 in stock; 20 admin deliveries of +1 and 6 customer purchases of 1, all at once.
      const work = [
        ...Array.from({ length: 20 }, () => adjustStock(pool, { bookId, change: 1, adminId: ADMIN })),
        ...Array.from({ length: 6 }, () => buy([{ bookId, quantity: 1 }])),
      ];
      assert.deepEqual((await Promise.allSettled(work)).filter(r => r.status === 'rejected'), []);
      assert.equal(await stockOf(bookId), 10 + 20 - 6);
      const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM inventory_adjustments WHERE book_id = ?', [bookId]);
      assert.equal(n, 20);
    });
  });
});

describe('/api/inventory (#10)', databaseTests, () => {
  let testDb;
  let api;

  before(async () => {
    testDb = await createTestDatabase({ seed: true });
    api = await startTestServer(testDb.pool);
  });
  after(async () => {
    await api.close();
    await testDb.drop();
  });

  const quantityOf = async bookId => (await testDb.pool.query('SELECT quantity FROM inventory WHERE book_id = ?', [bookId]))[0][0].quantity;

  describe('access control (SEC-3)', () => {
    it('answers 401 for admin routes when nobody is signed in', async () => {
      const response = await api.get('/api/inventory/stock');
      assert.equal(response.status, 401);
      assert.equal(response.body.error.code, 'UNAUTHENTICATED');
    });

    it('answers 403 for a customer on every admin route and changes nothing', async () => {
      for (const [method, path, body] of [
        ['get', '/api/inventory/stock'],
        ['get', '/api/inventory/stock/1'],
        ['put', '/api/inventory/stock/1', { quantity: 5 }],
        ['patch', '/api/inventory/stock/1', { change: 5 }],
      ]) {
        const response = await (body ? api[method](path, body, { user: CUSTOMER }) : api[method](path, { user: CUSTOMER }));
        assert.equal(response.status, 403, `${method.toUpperCase()} ${path}`);
        assert.equal(response.body.error.code, 'FORBIDDEN');
      }
      assert.equal(await quantityOf(1), 40);
    });

    it('answers 401 for a user that does not exist', async () => {
      assert.equal((await api.get('/api/inventory/stock', { user: 9999 })).status, 401);
    });

    it('keeps the availability labels public', async () => {
      assert.equal((await api.get('/api/inventory/availability?bookIds=1')).status, 200);
    });
  });

  describe('GET /api/inventory/availability', () => {
    it('returns labels for the requested books and never exact quantities', async () => {
      const response = await api.get('/api/inventory/availability?bookIds=1,19,6,999999');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.availability, [
        { bookId: 1, stockStatus: 'in_stock', available: true },
        { bookId: 19, stockStatus: 'out_of_stock', available: false },
        { bookId: 6, stockStatus: 'low_stock', available: true },
        { bookId: 999999, stockStatus: 'out_of_stock', available: false },
      ]);
    });

    it('rejects missing or malformed ids', async () => {
      for (const query of ['', '?bookIds=', '?bookIds=a,b', '?bookIds=1,,2', '?bookIds=1&bookIds=2']) {
        const response = await api.get(`/api/inventory/availability${query}`);
        assert.equal(response.status, 400, query);
        assert.equal(response.body.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  describe('POST /api/inventory/validate', () => {
    it('requires a signed-in user', async () => {
      assert.equal((await api.post('/api/inventory/validate', { items: [{ bookId: 1, quantity: 1 }] })).status, 401);
    });

    it('says ok when everything is available', async () => {
      const response = await api.post('/api/inventory/validate', { items: [{ bookId: 1, quantity: 2 }, { bookId: 20, quantity: 1 }] }, { user: CUSTOMER });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { ok: true, shortages: [] });
    });

    it('lists what is short, with the real available number', async () => {
      const response = await api.post('/api/inventory/validate', { items: [{ bookId: 6, quantity: 9 }, { bookId: 19, quantity: 1 }] }, { user: CUSTOMER });
      assert.equal(response.status, 200);
      assert.equal(response.body.ok, false);
      assert.deepEqual(response.body.shortages.map(s => [s.bookId, s.requested, s.available]), [[6, 9, 3], [19, 1, 0]]);
    });

    it('rejects invalid quantities with a clear message and changes no stock', async () => {
      for (const quantity of [0, -3, 1.5, '2', null]) {
        const response = await api.post('/api/inventory/validate', { items: [{ bookId: 1, quantity }] }, { user: CUSTOMER });
        assert.equal(response.status, 400, String(quantity));
        assert.equal(response.body.error.details[0].field, 'items.0.quantity');
        assert.equal(response.body.error.details[0].message, 'Quantity must be a whole number of at least 1.');
      }
      assert.equal(await quantityOf(1), 40);
    });

    it('rejects an empty or missing list', async () => {
      for (const body of [{}, { items: [] }, { items: 'x' }]) {
        assert.equal((await api.post('/api/inventory/validate', body, { user: CUSTOMER })).status, 400, JSON.stringify(body));
      }
    });
  });

  describe('GET /api/inventory/stock', () => {
    it('lists exact quantities, lowest stock first', async () => {
      const response = await api.get('/api/inventory/stock?pageSize=100', { user: ADMIN });
      assert.equal(response.status, 200);
      assert.equal(response.body.pagination.totalItems, 25);
      const quantities = response.body.stock.map(row => row.quantity);
      assert.deepEqual(quantities, [...quantities].sort((a, b) => a - b));
      assert.deepEqual(Object.keys(response.body.stock[0]).sort(), ['author', 'bookId', 'isActive', 'isbn', 'quantity', 'stockStatus', 'title', 'updatedAt']);
    });

    it('filters to out-of-stock and low-stock books', async () => {
      const out = await api.get('/api/inventory/stock?status=out', { user: ADMIN });
      assert.equal(out.body.pagination.totalItems, 2);
      assert.ok(out.body.stock.every(row => row.quantity === 0 && row.stockStatus === 'out_of_stock'));

      const low = await api.get('/api/inventory/stock?status=low', { user: ADMIN });
      assert.equal(low.body.pagination.totalItems, 3);
      assert.ok(low.body.stock.every(row => row.quantity >= 1 && row.quantity <= 5 && row.stockStatus === 'low_stock'));
    });

    it('searches by title, author or ISBN and paginates', async () => {
      const byTitle = await api.get('/api/inventory/stock?q=dracula', { user: ADMIN });
      assert.equal(byTitle.body.stock.length, 1);
      assert.equal(byTitle.body.stock[0].title, 'Dracula');

      const byIsbn = await api.get(`/api/inventory/stock?q=${byTitle.body.stock[0].isbn}`, { user: ADMIN });
      assert.equal(byIsbn.body.stock[0].title, 'Dracula');

      const page = await api.get('/api/inventory/stock?pageSize=10&page=3', { user: ADMIN });
      assert.equal(page.body.stock.length, 5);
      assert.deepEqual(page.body.pagination, { page: 3, pageSize: 10, totalItems: 25, totalPages: 3 });
    });

    it('rejects invalid options with a list of problems', async () => {
      const response = await api.get('/api/inventory/stock?status=weird&pageSize=500&page=0', { user: ADMIN });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
      assert.deepEqual(response.body.error.details.map(d => d.field).sort(), ['page', 'pageSize', 'status']);
    });
  });

  describe('GET /api/inventory/stock/:bookId', () => {
    it('returns one book', async () => {
      const response = await api.get('/api/inventory/stock/1', { user: ADMIN });
      assert.equal(response.status, 200);
      assert.equal(response.body.stock.title, 'Pride and Prejudice');
      assert.equal(response.body.stock.quantity, 40);
    });

    it('answers 404 for an unknown book and 400 for a malformed id', async () => {
      assert.equal((await api.get('/api/inventory/stock/99999', { user: ADMIN })).status, 404);
      const bad = await api.get('/api/inventory/stock/abc', { user: ADMIN });
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error.message, 'That book id is not valid.');
    });
  });

  describe('PUT /api/inventory/stock/:bookId (set exact stock)', () => {
    it('sets the stock, returns the updated record and writes the audit row', async () => {
      const response = await api.put('/api/inventory/stock/2', { quantity: 77, reason: '  Shelf count  ' }, { user: ADMIN });
      assert.equal(response.status, 200);
      assert.equal(response.body.stock.quantity, 77);
      assert.equal(await quantityOf(2), 77);

      const [[audit]] = await testDb.pool.query('SELECT admin_id, quantity_before, quantity_after, reason FROM inventory_adjustments WHERE book_id = 2');
      assert.deepEqual(audit, { admin_id: 1, quantity_before: 25, quantity_after: 77, reason: 'Shelf count' });
    });

    it('rejects bad quantities in plain language and changes nothing', async () => {
      const cases = [
        [{ quantity: -1 }, 'Quantity cannot be negative.'],
        [{ quantity: 1.5 }, 'Quantity must be a whole number.'],
        [{ quantity: '12' }, 'Quantity must be a whole number.'],
        [{}, 'Quantity must be a whole number.'],
        [{ quantity: 1000001 }, 'Quantity cannot be more than 1,000,000.'],
        [{ quantity: 5, reason: 'x'.repeat(201) }, 'The reason is too long (up to 200 characters).'],
      ];
      for (const [body, message] of cases) {
        const response = await api.put('/api/inventory/stock/3', body, { user: ADMIN });
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.equal(response.body.error.code, 'VALIDATION_ERROR');
        assert.ok(response.body.error.details.some(d => d.message === message), `${JSON.stringify(body)} -> ${JSON.stringify(response.body.error.details)}`);
      }
      assert.equal(await quantityOf(3), 18);
    });

    it('answers 404 for an unknown book', async () => {
      assert.equal((await api.put('/api/inventory/stock/99999', { quantity: 5 }, { user: ADMIN })).status, 404);
    });
  });

  describe('PATCH /api/inventory/stock/:bookId (add or remove copies)', () => {
    it('adds and removes copies', async () => {
      const added = await api.patch('/api/inventory/stock/4', { change: 8, reason: 'Delivery' }, { user: ADMIN });
      assert.equal(added.status, 200);
      assert.equal(added.body.stock.quantity, 20);

      const removed = await api.patch('/api/inventory/stock/4', { change: -20, reason: 'Water damage' }, { user: ADMIN });
      assert.equal(removed.body.stock.quantity, 0);
      assert.equal(removed.body.stock.stockStatus, 'out_of_stock');
    });

    it('answers 409 with a clear message when it would go below zero', async () => {
      const response = await api.patch('/api/inventory/stock/5', { change: -31 }, { user: ADMIN });
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, 'STOCK_BELOW_ZERO');
      assert.equal(response.body.error.message, 'Stock cannot go below zero: only 30 copies in stock, so 31 cannot be removed.');
      assert.equal(await quantityOf(5), 30);
    });

    it('rejects a zero or non-numeric change', async () => {
      for (const body of [{ change: 0 }, { change: 'ten' }, { change: 2.5 }, {}]) {
        assert.equal((await api.patch('/api/inventory/stock/5', body, { user: ADMIN })).status, 400, JSON.stringify(body));
      }
      assert.equal(await quantityOf(5), 30);
    });

    it('rejects a request body that is not valid JSON', async () => {
      const response = await fetch(`${api.baseUrl}/api/inventory/stock/5`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-user': String(ADMIN) },
        body: '{"change": ',
      });
      assert.equal(response.status, 400);
    });
  });

  describe('what customers see (SRS 5.3 / 5.7)', () => {
    it('shows "out of stock" in the catalogue right after the administrator sells out a book', async () => {
      await api.put('/api/inventory/stock/6', { quantity: 0 }, { user: ADMIN });
      const { body } = await api.get('/api/catalogue/books?q=Two Cities');
      const book = body.books.find(item => item.id === 6);
      assert.ok(book, 'the book is still listed, just marked out of stock');
      assert.equal(book.available, false);
      assert.equal(book.stockStatus, 'out_of_stock');
      assert.equal('quantity' in book, false, 'customers never see exact quantities');
    });
  });
});
