'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, startTestServer } = require('./helpers');

// Seed users: 1 = admin, 2 = Asha (cart: Pride and Prejudice x2 + Dracula x1), 3 = Ravi (no cart)
const ASHA = { 'x-dev-user-id': '2' };
const RAVI = { 'x-dev-user-id': '3' };
const ADMIN = { 'x-dev-user-id': '1' };

const validDelivery = () => ({
  recipientName: 'Asha Rao',
  phone: '98765 43210',
  addressLine1: '12, 4th Cross, Indiranagar',
  addressLine2: 'Near the metro station',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560038',
  country: 'India',
});

describe('/api/checkout', () => {
  let testDb;
  let api;

  before(async () => {
    testDb = await createTestDatabase({ seed: true });
    api = await startTestServer(testDb.pool);
  });
  beforeEach(async () => {
    // Back to the seed state for the parts these tests change.
    await testDb.pool.query('DELETE FROM delivery_details');
    await testDb.pool.query('UPDATE inventory SET quantity = 40 WHERE book_id = 1');
    await testDb.pool.query('UPDATE inventory SET quantity = 21 WHERE book_id = 20');
    await testDb.pool.query('UPDATE books SET is_active = TRUE, price = 299.00 WHERE id = 1');
  });
  after(async () => {
    await api.close();
    await testDb.drop();
  });

  describe('access control', () => {
    it('requires sign-in', async () => {
      assert.equal((await api.get('/api/checkout')).status, 401);
      assert.equal((await api.put('/api/checkout/delivery', validDelivery())).status, 401);
    });

    it('is for customers only', async () => {
      const res = await api.get('/api/checkout', ADMIN);
      assert.equal(res.status, 403);
    });

    it('marks responses as not cacheable because they hold personal data', async () => {
      const res = await fetch(`${api.baseUrl}/api/checkout`, { headers: ASHA });
      assert.equal(res.headers.get('cache-control'), 'no-store');
    });
  });

  describe('GET /api/checkout (review and summary)', () => {
    it('lists the cart lines with prices and exact totals', async () => {
      const res = await api.get('/api/checkout', ASHA);
      assert.equal(res.status, 200);
      const { items, totals, itemCount } = res.body.data;

      assert.deepEqual(
        items.map((i) => [i.title, i.unitPrice, i.quantity, i.lineTotal, i.available]),
        [
          ['Pride and Prejudice', 299, 2, 598, true],
          ['Dracula', items[1].unitPrice, 1, items[1].unitPrice, true],
        ]
      );
      assert.equal(itemCount, 3);
      assert.deepEqual(items[0].category, { id: 1, name: 'Classics' }, 'the cover needs the category colour');
      assert.deepEqual(totals, { subtotal: 598 + items[1].unitPrice, total: 598 + items[1].unitPrice });
    });

    it('is ready to proceed only after delivery details are saved', async () => {
      const before = await api.get('/api/checkout', ASHA);
      assert.equal(before.body.data.delivery, null);
      assert.equal(before.body.data.canProceed, false);

      await api.put('/api/checkout/delivery', validDelivery(), ASHA);
      const after = await api.get('/api/checkout', ASHA);
      assert.equal(after.body.data.canProceed, true);
      assert.equal(after.body.data.delivery.city, 'Bengaluru');
      assert.equal(after.body.data.suggestedDelivery, null);
    });

    it('suggests name and phone from the profile before anything is saved', async () => {
      const res = await api.get('/api/checkout', ASHA);
      assert.deepEqual(res.body.data.suggestedDelivery, { recipientName: 'Asha Rao', phone: '9876543210' });
    });

    it('shows an empty cart as empty, not as an error', async () => {
      const res = await api.get('/api/checkout', RAVI);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data.items, []);
      assert.deepEqual(res.body.data.totals, { subtotal: 0, total: 0 });
      assert.equal(res.body.data.canProceed, false);
    });

    it('only ever shows the signed-in customer’s own cart', async () => {
      await testDb.pool.query('INSERT INTO carts (customer_id) VALUES (3)');
      const [[{ id }]] = await testDb.pool.query('SELECT id FROM carts WHERE customer_id = 3');
      await testDb.pool.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, 2, 1)', [id]);
      try {
        const ravi = await api.get('/api/checkout', RAVI);
        assert.deepEqual(ravi.body.data.items.map((i) => i.title), ['Emma']);
        const asha = await api.get('/api/checkout', ASHA);
        assert.ok(!asha.body.data.items.some((i) => i.title === 'Emma'));
      } finally {
        await testDb.pool.query('DELETE FROM carts WHERE customer_id = 3');
      }
    });

    it('flags a book whose stock fell below the chosen quantity and blocks checkout', async () => {
      await api.put('/api/checkout/delivery', validDelivery(), ASHA);
      await testDb.pool.query('UPDATE inventory SET quantity = 1 WHERE book_id = 1');

      const { data } = (await api.get('/api/checkout', ASHA)).body;
      assert.equal(data.stock.ok, false);
      assert.equal(data.canProceed, false);
      const line = data.items.find((i) => i.bookId === 1);
      assert.equal(line.available, false);
      assert.equal(line.problem, 'Only 1 copy of “Pride and Prejudice” is available, but you chose 2.');
      assert.equal(data.items.find((i) => i.bookId === 20).problem, null);
    });

    it('flags an out-of-stock or removed book', async () => {
      await testDb.pool.query('UPDATE inventory SET quantity = 0 WHERE book_id = 20');
      await testDb.pool.query('UPDATE books SET is_active = FALSE WHERE id = 1');
      const { data } = (await api.get('/api/checkout', ASHA)).body;
      assert.equal(data.items.find((i) => i.bookId === 20).problem, '“Dracula” is out of stock.');
      assert.equal(data.items.find((i) => i.bookId === 1).problem, '“Pride and Prejudice” is no longer available.');
      assert.equal(data.canProceed, false);
    });

    it('uses the current catalogue price', async () => {
      await testDb.pool.query('UPDATE books SET price = 310.50 WHERE id = 1');
      const { data } = (await api.get('/api/checkout', ASHA)).body;
      assert.equal(data.items[0].unitPrice, 310.5);
      assert.equal(data.items[0].lineTotal, 621);
    });

    it('does not change stock or create orders', async () => {
      await api.get('/api/checkout', ASHA);
      const [[stock]] = await testDb.pool.query('SELECT quantity FROM inventory WHERE book_id = 1');
      const [[orders]] = await testDb.pool.query('SELECT COUNT(*) AS n FROM orders');
      assert.equal(stock.quantity, 40);
      assert.equal(orders.n, 0);
    });
  });

  describe('PUT /api/checkout/delivery', () => {
    it('saves the details, tidied up, and returns them', async () => {
      const res = await api.put(
        '/api/checkout/delivery',
        { ...validDelivery(), recipientName: '  Asha   Rao ', phone: '+91 (98765) 43-210', addressLine2: '   ' },
        ASHA
      );
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { ...validDelivery(), recipientName: 'Asha Rao', phone: '+919876543210', addressLine2: null });
    });

    it('replaces earlier details instead of adding a second record', async () => {
      await api.put('/api/checkout/delivery', validDelivery(), ASHA);
      await api.put('/api/checkout/delivery', { ...validDelivery(), city: 'Mysuru', postalCode: '570001' }, ASHA);
      const [rows] = await testDb.pool.query('SELECT city, postal_code FROM delivery_details');
      assert.deepEqual(rows, [{ city: 'Mysuru', postal_code: '570001' }]);
    });

    it('keeps address line 2 optional', async () => {
      const { addressLine2: _omitted, ...details } = validDelivery();
      const res = await api.put('/api/checkout/delivery', details, ASHA);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.addressLine2, null);
    });

    it('lists every missing field in plain language', async () => {
      const res = await api.put('/api/checkout/delivery', {}, ASHA);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.equal(res.body.error.message, 'Some of the delivery details are missing or not valid.');
      assert.deepEqual(
        Object.fromEntries(res.body.error.details.map((d) => [d.field, d.message])),
        {
          recipientName: 'Recipient name is required.',
          phone: 'Phone number is required.',
          addressLine1: 'Address is required.',
          city: 'City is required.',
          state: 'State is required.',
          postalCode: 'Postal code is required.',
          country: 'Country is required.',
        }
      );
    });

    it('treats blank text as missing', async () => {
      const res = await api.put('/api/checkout/delivery', { ...validDelivery(), city: '   ', state: '' }, ASHA);
      assert.equal(res.status, 400);
      const fields = res.body.error.details.map((d) => d.field).sort();
      assert.deepEqual(fields, ['city', 'state']);
    });

    for (const [name, patch, field, message] of [
      ['a one-letter name', { recipientName: 'A' }, 'recipientName', 'Enter the recipient’s full name.'],
      ['a name without letters', { recipientName: '12345' }, 'recipientName', 'Enter the recipient’s full name.'],
      ['a short phone number', { phone: '12345' }, 'phone', 'Enter a valid phone number, for example 9876543210 or +91 98765 43210.'],
      ['letters in the phone number', { phone: '98765abcde' }, 'phone', 'Enter a valid phone number, for example 9876543210 or +91 98765 43210.'],
      ['a 5-digit Indian PIN code', { postalCode: '56003' }, 'postalCode', 'Enter a 6-digit PIN code, for example 560001.'],
      ['a PIN code starting with 0', { postalCode: '060001' }, 'postalCode', 'Enter a 6-digit PIN code, for example 560001.'],
      ['an over-long address', { addressLine1: 'x'.repeat(151) }, 'addressLine1', 'Address is too long (up to 150 characters).'],
      ['a control character', { city: 'Beng\u0007aluru' }, 'city', 'City contains characters that are not allowed.'],
      ['a non-text value', { state: 42 }, 'state', 'State is required.'],
    ]) {
      it(`rejects ${name}`, async () => {
        const res = await api.put('/api/checkout/delivery', { ...validDelivery(), ...patch }, ASHA);
        assert.equal(res.status, 400);
        assert.deepEqual(res.body.error.details, [{ field, message }]);
        const [[{ n }]] = await testDb.pool.query('SELECT COUNT(*) AS n FROM delivery_details');
        assert.equal(n, 0, 'nothing is saved when validation fails');
      });
    }

    it('accepts a foreign address with a non-Indian postal code format', async () => {
      const res = await api.put(
        '/api/checkout/delivery',
        { ...validDelivery(), country: 'United Kingdom', postalCode: 'SW1A 1AA', state: 'England', city: 'London' },
        ASHA
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.data.postalCode, 'SW1A 1AA');
    });

    it('refuses an empty cart', async () => {
      const res = await api.put('/api/checkout/delivery', validDelivery(), RAVI);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'EMPTY_CART');
      assert.equal(res.body.error.message, 'Your cart is empty. Add a book before you check out.');
    });

    it('stores text safely: quotes and SQL are data, not code', async () => {
      const nasty = "Robert'); DROP TABLE books;--";
      const res = await api.put('/api/checkout/delivery', { ...validDelivery(), addressLine1: nasty }, ASHA);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.addressLine1, nasty);
      const [[{ n }]] = await testDb.pool.query('SELECT COUNT(*) AS n FROM books');
      assert.equal(n, 25);
    });

    it('ignores fields it does not know, such as someone else’s cart id', async () => {
      const res = await api.put('/api/checkout/delivery', { ...validDelivery(), cartId: 999, customerId: 3 }, ASHA);
      assert.equal(res.status, 200);
      const [rows] = await testDb.pool.query('SELECT cart_id FROM delivery_details');
      assert.deepEqual(rows, [{ cart_id: 1 }]);
    });

    it('does not let one customer read or change another customer’s details', async () => {
      await api.put('/api/checkout/delivery', validDelivery(), ASHA);
      const ravi = await api.get('/api/checkout', RAVI);
      assert.equal(ravi.body.data.delivery, null);
    });
  });
});
