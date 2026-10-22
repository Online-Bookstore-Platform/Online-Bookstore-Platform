'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, startTestServer } = require('./helpers');

// Seed users: 1 = admin, 2 = Asha (customer), 3 = Ravi (customer)
const ADMIN = { 'x-dev-user-id': '1' };
const CUSTOMER = { 'x-dev-user-id': '2' };

describe('/api/inventory (administrator stock management)', () => {
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

  const quantityOf = async (bookId) => {
    const [[row]] = await testDb.pool.query('SELECT quantity FROM inventory WHERE book_id = ?', [bookId]);
    return row.quantity;
  };

  describe('access control (SEC-3)', () => {
    it('answers 401 when nobody is signed in', async () => {
      const res = await api.get('/api/inventory');
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } });
    });

    it('answers 403 for a customer on every route', async () => {
      for (const [method, path, body] of [
        ['get', '/api/inventory'],
        ['get', '/api/inventory/1'],
        ['put', '/api/inventory/1', { quantity: 5 }],
        ['patch', '/api/inventory/1', { change: 5 }],
      ]) {
        const res = await api[method](path, ...(body ? [body, CUSTOMER] : [CUSTOMER]));
        assert.equal(res.status, 403, `${method.toUpperCase()} ${path}`);
        assert.equal(res.body.error.code, 'FORBIDDEN');
      }
      assert.equal(await quantityOf(1), 40, 'a forbidden request must not change anything');
    });

    it('answers 401 for a user id that does not exist, or is malformed', async () => {
      assert.equal((await api.get('/api/inventory', { 'x-dev-user-id': '9999' })).status, 401);
      assert.equal((await api.get('/api/inventory', { 'x-dev-user-id': 'abc' })).status, 401);
      assert.equal((await api.get('/api/inventory', { 'x-dev-user-id': '1; DROP TABLE books' })).status, 401);
    });

    it('ignores the dev header entirely unless dev auth is switched on', async () => {
      const locked = await startTestServer(testDb.pool, { allowDevAuth: false });
      try {
        assert.equal((await locked.get('/api/inventory', ADMIN)).status, 401);
      } finally {
        await locked.close();
      }
    });

    it('still lets anyone browse books without signing in', async () => {
      assert.equal((await api.get('/api/books')).status, 200);
    });
  });

  describe('GET /api/inventory', () => {
    it('lists exact quantities, lowest stock first', async () => {
      const res = await api.get('/api/inventory?pageSize=100', ADMIN);
      assert.equal(res.status, 200);
      assert.equal(res.body.pagination.totalItems, 25);
      const quantities = res.body.data.map((row) => row.quantity);
      assert.deepEqual(quantities, [...quantities].sort((a, b) => a - b));
      assert.deepEqual(Object.keys(res.body.data[0]).sort(), [
        'author',
        'bookId',
        'isActive',
        'isbn',
        'quantity',
        'stockStatus',
        'title',
        'updatedAt',
      ]);
    });

    it('filters to out-of-stock books', async () => {
      const res = await api.get('/api/inventory?status=out', ADMIN);
      assert.equal(res.body.pagination.totalItems, 2);
      assert.ok(res.body.data.every((row) => row.quantity === 0 && row.stockStatus === 'out_of_stock'));
    });

    it('filters to low-stock books (1 to 5 copies)', async () => {
      const res = await api.get('/api/inventory?status=low', ADMIN);
      assert.equal(res.body.pagination.totalItems, 3);
      assert.ok(res.body.data.every((row) => row.quantity >= 1 && row.quantity <= 5 && row.stockStatus === 'low_stock'));
    });

    it('searches by title, author or ISBN and paginates', async () => {
      const byTitle = await api.get('/api/inventory?q=dracula', ADMIN);
      assert.equal(byTitle.body.data.length, 1);
      assert.equal(byTitle.body.data[0].title, 'Dracula');

      const byIsbn = await api.get(`/api/inventory?q=${byTitle.body.data[0].isbn}`, ADMIN);
      assert.equal(byIsbn.body.data[0].title, 'Dracula');

      const page = await api.get('/api/inventory?pageSize=10&page=3', ADMIN);
      assert.equal(page.body.data.length, 5);
      assert.deepEqual(page.body.pagination, { page: 3, pageSize: 10, totalItems: 25, totalPages: 3 });
    });

    it('rejects invalid options with a list of problems', async () => {
      const res = await api.get('/api/inventory?status=weird&pageSize=500&page=0', ADMIN);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['page', 'pageSize', 'status']);
    });
  });

  describe('GET /api/inventory/:bookId', () => {
    it('returns one book', async () => {
      const res = await api.get('/api/inventory/1', ADMIN);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.title, 'Pride and Prejudice');
      assert.equal(res.body.data.quantity, 40);
    });

    it('answers 404 for an unknown book and 400 for a malformed id', async () => {
      assert.equal((await api.get('/api/inventory/99999', ADMIN)).status, 404);
      const bad = await api.get('/api/inventory/abc', ADMIN);
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error.message, 'That book id is not valid.');
    });
  });

  describe('PUT /api/inventory/:bookId (set exact stock)', () => {
    it('sets the stock and returns the updated record', async () => {
      const res = await api.put('/api/inventory/2', { quantity: 77, reason: '  Shelf count  ' }, ADMIN);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.quantity, 77);
      assert.equal(await quantityOf(2), 77);

      const [[audit]] = await testDb.pool.query(
        'SELECT admin_id, quantity_before, quantity_after, reason FROM inventory_adjustments WHERE book_id = 2'
      );
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
        const res = await api.put('/api/inventory/3', body, ADMIN);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        assert.ok(
          res.body.error.details.some((d) => d.message === message),
          `${JSON.stringify(body)} -> ${JSON.stringify(res.body.error.details)}`
        );
      }
      assert.equal(await quantityOf(3), 18);
    });

    it('answers 404 for an unknown book', async () => {
      const res = await api.put('/api/inventory/99999', { quantity: 5 }, ADMIN);
      assert.equal(res.status, 404);
    });
  });

  describe('PATCH /api/inventory/:bookId (add or remove copies)', () => {
    it('adds and removes copies', async () => {
      const added = await api.patch('/api/inventory/4', { change: 8, reason: 'Delivery' }, ADMIN);
      assert.equal(added.status, 200);
      assert.equal(added.body.data.quantity, 20);

      const removed = await api.patch('/api/inventory/4', { change: -20, reason: 'Water damage' }, ADMIN);
      assert.equal(removed.body.data.quantity, 0);
      assert.equal(removed.body.data.stockStatus, 'out_of_stock');
    });

    it('answers 409 with a clear message when it would go below zero', async () => {
      const res = await api.patch('/api/inventory/5', { change: -31 }, ADMIN);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'STOCK_BELOW_ZERO');
      assert.equal(res.body.error.message, 'Stock cannot go below zero: only 30 copies in stock, so 31 cannot be removed.');
      assert.equal(await quantityOf(5), 30);
    });

    it('rejects a zero or non-numeric change', async () => {
      for (const body of [{ change: 0 }, { change: 'ten' }, { change: 2.5 }, {}]) {
        const res = await api.patch('/api/inventory/5', body, ADMIN);
        assert.equal(res.status, 400, JSON.stringify(body));
      }
      assert.equal(await quantityOf(5), 30);
    });

    it('rejects a request body that is not valid JSON', async () => {
      const res = await fetch(`${api.baseUrl}/api/inventory/5`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...ADMIN },
        body: '{"change": ',
      });
      assert.equal(res.status, 400);
    });
  });

  describe('what customers see (SRS 5.3 / 5.7)', () => {
    it('shows "out of stock" in the catalogue right after the administrator sells out a book', async () => {
      await api.put('/api/inventory/6', { quantity: 0 }, ADMIN);
      const res = await api.get('/api/books?q=Two Cities');
      const book = res.body.data.find((b) => b.id === 6);
      assert.ok(book, 'the book is still listed, just marked out of stock');
      assert.equal(book.inStock, false);
      assert.equal(book.stockStatus, 'out_of_stock');
      assert.equal('quantity' in book, false, 'customers never see exact quantities');
    });
  });
});
