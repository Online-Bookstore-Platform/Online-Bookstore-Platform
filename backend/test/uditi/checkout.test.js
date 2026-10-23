import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase, databaseTests, startTestServer, validDelivery } from './helpers.js';
import { createDatabasePool } from '../../src/config/database.js';
import { fromCents, lineTotal, sum, toCents } from '../../src/features/uditi/shared/money.js';
import { parseDeliveryDetails } from '../../src/features/uditi/checkout/checkout.validation.js';

// Seed users: 1 = admin, 2 = Asha (cart: Pride and Prejudice x2 + Dracula x1), 3 = Ravi (no cart)
const ADMIN = 1;
const ASHA = 2;
const RAVI = 3;

describe('money (unit)', () => {
  it('converts to and from whole paise', () => {
    assert.equal(toCents(299), 29900);
    assert.equal(toCents(19.99), 1999);
    assert.equal(toCents(0.07), 7);
    assert.equal(fromCents(1999), 19.99);
  });

  it('adds without floating-point drift', () => {
    assert.notEqual(0.1 + 0.2, 0.3); // the problem being avoided
    assert.equal(sum([0.1, 0.2]), 0.3);
    assert.equal(sum([19.99, 19.99, 19.99]), 59.97);
    assert.equal(sum([]), 0);
  });

  it('multiplies price by quantity exactly', () => {
    assert.equal(lineTotal(19.99, 3), 59.97);
    assert.equal(lineTotal(1.1, 3), 3.3); // 1.1 * 3 === 3.3000000000000003
    assert.equal(lineTotal(299, 2), 598);
  });

  it('rejects things that are not money', () => {
    assert.throws(() => toCents('12'), TypeError);
    assert.throws(() => toCents(NaN), TypeError);
    assert.throws(() => fromCents(1.5), TypeError);
  });
});

describe('delivery details validation (unit)', () => {
  const problems = body => {
    try {
      parseDeliveryDetails(body);
    } catch (error) {
      return Object.fromEntries(error.details.map(detail => [detail.field, detail.message]));
    }
    return null;
  };

  it('tidies valid details: collapses spaces, strips phone punctuation, empty line 2 becomes null', () => {
    assert.deepEqual(parseDeliveryDetails(validDelivery({ recipientName: '  Asha   Verma ', phone: '+91 (98765) 43-210', addressLine2: '   ' })), {
      ...validDelivery(),
      recipientName: 'Asha Verma',
      phone: '+919876543210',
      addressLine2: null,
    });
  });

  it('reports every missing field with its own plain-language message', () => {
    assert.deepEqual(problems({}), {
      recipientName: 'Recipient name is required.',
      phone: 'Phone number is required.',
      addressLine1: 'Address is required.',
      city: 'City is required.',
      state: 'State is required.',
      postalCode: 'Postal code is required.',
      country: 'Country is required.',
    });
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, undefined, 'text', 42, []]) assert.deepEqual(problems(body), { body: 'Send the delivery details as a JSON object.' });
  });

  for (const [name, patch, field, message] of [
    ['a one-letter name', { recipientName: 'A' }, 'recipientName', 'Enter the recipient’s full name.'],
    ['a name without letters', { recipientName: '12345' }, 'recipientName', 'Enter the recipient’s full name.'],
    ['a short phone number', { phone: '12345' }, 'phone', 'Enter a valid phone number, for example 9876543210 or +91 98765 43210.'],
    ['letters in the phone number', { phone: '98765abcde' }, 'phone', 'Enter a valid phone number, for example 9876543210 or +91 98765 43210.'],
    ['a 5-digit Indian PIN code', { postalCode: '56003' }, 'postalCode', 'Enter a 6-digit PIN code, for example 560001.'],
    ['a PIN code starting with 0', { postalCode: '060001' }, 'postalCode', 'Enter a 6-digit PIN code, for example 560001.'],
    ['an over-long address', { addressLine1: 'x'.repeat(151) }, 'addressLine1', 'Address is too long (up to 150 characters).'],
    ['an over-long address line 2', { addressLine2: 'x'.repeat(151) }, 'addressLine2', 'Address line 2 is too long (up to 150 characters).'],
    ['a control character', { city: 'Beng\u0007aluru' }, 'city', 'City contains characters that are not allowed.'],
    ['a non-text value', { state: 42 }, 'state', 'State is required.'],
  ]) {
    it(`rejects ${name}`, () => {
      assert.deepEqual(problems(validDelivery(patch)), { [field]: message });
    });
  }

  it('accepts a foreign address with a non-Indian postal code format', () => {
    assert.equal(parseDeliveryDetails(validDelivery({ country: 'United Kingdom', postalCode: 'SW1A 1AA', state: 'England', city: 'London' })).postalCode, 'SW1A 1AA');
    assert.ok(problems(validDelivery({ country: 'United Kingdom', postalCode: '!!' })).postalCode);
  });

  it('ignores unknown fields instead of passing them on', () => {
    assert.ok(!('userId' in parseDeliveryDetails({ ...validDelivery(), userId: 3, isAdmin: true })));
  });
});

describe('Uditi router wiring (no database needed)', () => {
  it('answers 503 on every route when the database connection is not configured', async () => {
    const api = await startTestServer(null, { withPool: false });
    try {
      for (const path of ['/api/catalogue/books', '/api/catalogue/filters', '/api/inventory/availability?bookIds=1', '/api/checkout/summary']) {
        const response = await api.get(path, { user: 1 });
        assert.equal(response.status, 503, path);
        assert.equal(response.body.error.code, 'DEPENDENCY_NOT_CONFIGURED', path);
      }
    } finally {
      await api.close();
    }
  });

  it('fails closed (503, never open) when sign-in is not connected, but keeps the public catalogue working', async () => {
    const pool = createDatabasePool({ host: '127.0.0.1', port: 1, user: 'nobody' });
    const api = await startTestServer(pool, { withAuth: false });
    try {
      for (const [method, path] of [['get', '/api/inventory/stock'], ['get', '/api/checkout/summary'], ['put', '/api/checkout/delivery']]) {
        const response = await api[method](path, ...(method === 'put' ? [validDelivery()] : []));
        assert.equal(response.status, 503, path);
        assert.equal(response.body.error.code, 'DEPENDENCY_NOT_CONFIGURED', path);
      }
    } finally {
      await api.close();
      await pool.end();
    }
  });

  it('answers 503 DATABASE_UNAVAILABLE, not a stack trace, when MySQL cannot be reached', async () => {
    const pool = createDatabasePool({ host: '127.0.0.1', port: 1, user: 'nobody', connectTimeout: 500 });
    const api = await startTestServer(pool);
    try {
      const response = await api.get('/api/catalogue/books');
      assert.equal(response.status, 503);
      assert.equal(response.body.error.code, 'DATABASE_UNAVAILABLE');
      assert.doesNotMatch(JSON.stringify(response.body), /ECONNREFUSED|stack/);
    } finally {
      await api.close();
      await pool.end();
    }
  });
});

describe('/api/checkout (#7)', databaseTests, () => {
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

  const summary = async user => (await api.get('/api/checkout/summary', { user })).body.checkout;

  describe('access control', () => {
    it('requires sign-in', async () => {
      assert.equal((await api.get('/api/checkout/summary')).status, 401);
      assert.equal((await api.put('/api/checkout/delivery', validDelivery())).status, 401);
    });

    it('marks responses as not cacheable because they hold personal data', async () => {
      const response = await api.get('/api/checkout/summary', { user: ASHA });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    });
  });

  describe('GET /api/checkout/summary (review and order summary)', () => {
    it('lists the cart lines with prices and exact totals', async () => {
      const response = await api.get('/api/checkout/summary', { user: ASHA });
      assert.equal(response.status, 200);
      const { items, totals, itemCount } = response.body.checkout;

      assert.deepEqual(items.map(i => [i.title, i.unitPrice, i.quantity, i.lineTotal, i.available]), [
        ['Pride and Prejudice', 299, 2, 598, true],
        ['Dracula', items[1].unitPrice, 1, items[1].unitPrice, true],
      ]);
      assert.equal(itemCount, 3);
      assert.equal(items[0].category, 'Classics');
      assert.deepEqual(totals, { subtotal: 598 + items[1].unitPrice, total: 598 + items[1].unitPrice, currency: 'INR' });
    });

    it('adds up awkward prices exactly (no 0.1 + 0.2 problems)', async () => {
      await testDb.pool.query('UPDATE books SET price = 19.99 WHERE id = 1');
      const { items, totals } = await summary(ASHA);
      assert.equal(items[0].lineTotal, 39.98);
      assert.equal(totals.subtotal, toCents(39.98 + items[1].unitPrice) / 100);
    });

    it('is ready to proceed only after delivery details are saved', async () => {
      const unsaved = await summary(ASHA);
      assert.equal(unsaved.delivery, null);
      assert.equal(unsaved.canProceed, false);

      await api.put('/api/checkout/delivery', validDelivery(), { user: ASHA });
      const saved = await summary(ASHA);
      assert.equal(saved.canProceed, true);
      assert.equal(saved.delivery.city, 'Bengaluru');
      assert.equal(saved.suggestedDelivery, null);
    });

    it('suggests name and phone from the account before anything is saved', async () => {
      assert.deepEqual((await summary(ASHA)).suggestedDelivery, { recipientName: 'Asha Rao', phone: '9876543210' });
    });

    it('shows an empty cart as empty, not as an error', async () => {
      const response = await api.get('/api/checkout/summary', { user: RAVI });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.checkout.items, []);
      assert.deepEqual(response.body.checkout.totals, { subtotal: 0, total: 0, currency: 'INR' });
      assert.equal(response.body.checkout.canProceed, false);
    });

    it('only ever shows the signed-in customer’s own cart', async () => {
      await testDb.pool.query('INSERT INTO carts (user_id) VALUES (3)');
      const [[{ id }]] = await testDb.pool.query('SELECT id FROM carts WHERE user_id = 3');
      await testDb.pool.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, 2, 1)', [id]);
      try {
        assert.deepEqual((await summary(RAVI)).items.map(i => i.title), ['Emma']);
        assert.ok(!(await summary(ASHA)).items.some(i => i.title === 'Emma'));
        // an id in the URL or query string cannot be used to read someone else's cart
        const sneaky = await api.get('/api/checkout/summary?userId=3&cartId=1', { user: RAVI });
        assert.deepEqual(sneaky.body.checkout.items.map(i => i.title), ['Emma']);
      } finally {
        await testDb.pool.query('DELETE FROM carts WHERE user_id = 3');
      }
    });

    it('flags a book whose stock fell below the chosen quantity and blocks checkout', async () => {
      await api.put('/api/checkout/delivery', validDelivery(), { user: ASHA });
      await testDb.pool.query('UPDATE inventory SET quantity = 1 WHERE book_id = 1');

      const data = await summary(ASHA);
      assert.equal(data.stock.ok, false);
      assert.equal(data.canProceed, false);
      const line = data.items.find(i => i.bookId === 1);
      assert.equal(line.available, false);
      assert.equal(line.problem, 'Only 1 copy of “Pride and Prejudice” is available, but you chose 2.');
      assert.equal(data.items.find(i => i.bookId === 20).problem, null);
    });

    it('flags an out-of-stock or removed book', async () => {
      await testDb.pool.query('UPDATE inventory SET quantity = 0 WHERE book_id = 20');
      await testDb.pool.query('UPDATE books SET is_active = FALSE WHERE id = 1');
      const data = await summary(ASHA);
      assert.equal(data.items.find(i => i.bookId === 20).problem, '“Dracula” is out of stock.');
      assert.equal(data.items.find(i => i.bookId === 1).problem, '“Pride and Prejudice” is no longer available.');
      assert.equal(data.canProceed, false);
    });

    it('re-reads the current catalogue price on every call (BR-3)', async () => {
      await testDb.pool.query('UPDATE books SET price = 310.50 WHERE id = 1');
      const { items } = await summary(ASHA);
      assert.equal(items[0].unitPrice, 310.5);
      assert.equal(items[0].lineTotal, 621);
    });

    it('does not change stock, the cart or create orders', async () => {
      await api.get('/api/checkout/summary', { user: ASHA });
      await api.put('/api/checkout/delivery', validDelivery(), { user: ASHA });
      assert.equal((await testDb.pool.query('SELECT quantity FROM inventory WHERE book_id = 1'))[0][0].quantity, 40);
      assert.equal((await testDb.pool.query('SELECT COUNT(*) AS n FROM orders'))[0][0].n, 0);
      assert.equal((await testDb.pool.query('SELECT SUM(quantity) AS n FROM cart_items'))[0][0].n, 3);
    });
  });

  describe('the cart comes from the cart service, not from checkout', () => {
    it('uses whatever the injected cart reader returns (e.g. Vrinda’s cart service)', async () => {
      const calls = [];
      const injected = await startTestServer(testDb.pool, {
        cartReader: { getItems: async userId => (calls.push(userId), [{ bookId: 2, quantity: 3 }]) },
      });
      try {
        const { checkout } = (await injected.get('/api/checkout/summary', { user: RAVI })).body;
        assert.deepEqual(calls, [RAVI], 'the cart is asked for the SIGNED-IN user only');
        assert.deepEqual(checkout.items.map(i => [i.title, i.quantity]), [['Emma', 3]]);
        assert.equal(checkout.items[0].unitPrice, 279, 'the price is read from the catalogue, never from the cart');
      } finally {
        await injected.close();
      }
    });

    it('merges repeated books and ignores any price a cart might carry', async () => {
      const injected = await startTestServer(testDb.pool, {
        cartReader: { getItems: async () => [{ bookId: 2, quantity: 1, price: 1 }, { bookId: '2', quantity: 2, price: 1 }] },
      });
      try {
        const { items } = (await injected.get('/api/checkout/summary', { user: RAVI })).body.checkout;
        assert.deepEqual(items.map(i => [i.bookId, i.quantity, i.unitPrice]), [[2, 3, 279]]);
      } finally {
        await injected.close();
      }
    });

    it('answers 503 (and invents no cart) when no cart service is connected', async () => {
      const unconnected = await startTestServer(testDb.pool, { cartReader: null });
      try {
        const response = await unconnected.get('/api/checkout/summary', { user: ASHA });
        assert.equal(response.status, 503);
        assert.equal(response.body.error.code, 'DEPENDENCY_NOT_CONFIGURED');
        assert.equal(response.body.checkout, undefined);
      } finally {
        await unconnected.close();
      }
    });

    it('answers 502 when the cart service returns data checkout cannot use', async () => {
      for (const bad of ['nope', [{ bookId: 1, quantity: 0 }], [{ bookId: 'x', quantity: 1 }], [null]]) {
        const injected = await startTestServer(testDb.pool, { cartReader: { getItems: async () => bad } });
        try {
          const response = await injected.get('/api/checkout/summary', { user: ASHA });
          assert.equal(response.status, 502, JSON.stringify(bad));
          assert.equal(response.body.error.code, 'CART_INVALID');
        } finally {
          await injected.close();
        }
      }
    });

    it('does not turn a failing cart service into fake success', async () => {
      const injected = await startTestServer(testDb.pool, { cartReader: { getItems: async () => { throw new Error('cart service exploded'); } } });
      try {
        const response = await injected.get('/api/checkout/summary', { user: ASHA });
        assert.equal(response.status, 500);
        assert.doesNotMatch(JSON.stringify(response.body), /exploded/);
      } finally {
        await injected.close();
      }
    });
  });

  describe('PUT /api/checkout/delivery', () => {
    it('saves the details, tidied up, and returns them', async () => {
      const response = await api.put('/api/checkout/delivery', validDelivery({ recipientName: '  Asha   Rao ', phone: '+91 (98765) 43-210', addressLine2: '   ' }), { user: ASHA });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.delivery, validDelivery({ recipientName: 'Asha Rao', phone: '+919876543210', addressLine2: null }));
    });

    it('replaces earlier details instead of adding a second record', async () => {
      await api.put('/api/checkout/delivery', validDelivery(), { user: ASHA });
      await api.put('/api/checkout/delivery', validDelivery({ city: 'Mysuru', postalCode: '570001' }), { user: ASHA });
      const [rows] = await testDb.pool.query('SELECT user_id, city, postal_code FROM delivery_details');
      assert.deepEqual(rows, [{ user_id: ASHA, city: 'Mysuru', postal_code: '570001' }]);
    });

    it('keeps address line 2 optional', async () => {
      const { addressLine2: _omitted, ...details } = validDelivery();
      const response = await api.put('/api/checkout/delivery', details, { user: ASHA });
      assert.equal(response.status, 200);
      assert.equal(response.body.delivery.addressLine2, null);
    });

    it('answers 400 listing every problem, and saves nothing', async () => {
      const response = await api.put('/api/checkout/delivery', validDelivery({ recipientName: '', phone: 'abc', postalCode: '1' }), { user: ASHA });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
      assert.equal(response.body.error.message, 'Some of the delivery details are missing or not valid.');
      assert.deepEqual(response.body.error.details.map(d => d.field).sort(), ['phone', 'postalCode', 'recipientName']);
      assert.equal((await testDb.pool.query('SELECT COUNT(*) AS n FROM delivery_details'))[0][0].n, 0);
    });

    it('rejects a body that is not valid JSON', async () => {
      const response = await fetch(`${api.baseUrl}/api/checkout/delivery`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-test-user': String(ASHA) },
        body: '{"city": ',
      });
      assert.equal(response.status, 400);
    });

    it('refuses an empty cart', async () => {
      const response = await api.put('/api/checkout/delivery', validDelivery(), { user: RAVI });
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, 'EMPTY_CART');
      assert.equal(response.body.error.message, 'Your cart is empty. Add a book before you check out.');
    });

    it('stores text safely: quotes and SQL are data, not code', async () => {
      const nasty = "Robert'); DROP TABLE books;--";
      const response = await api.put('/api/checkout/delivery', validDelivery({ addressLine1: nasty }), { user: ASHA });
      assert.equal(response.status, 200);
      assert.equal(response.body.delivery.addressLine1, nasty);
      assert.equal((await testDb.pool.query('SELECT COUNT(*) AS n FROM books'))[0][0].n, 25);
    });

    it('always saves for the signed-in user, ignoring a user id in the body', async () => {
      const response = await api.put('/api/checkout/delivery', { ...validDelivery(), userId: RAVI, user_id: RAVI }, { user: ASHA });
      assert.equal(response.status, 200);
      const [rows] = await testDb.pool.query('SELECT user_id FROM delivery_details');
      assert.deepEqual(rows, [{ user_id: ASHA }]);
    });

    it('does not let one customer read another customer’s details', async () => {
      await api.put('/api/checkout/delivery', validDelivery(), { user: ASHA });
      assert.equal((await summary(RAVI)).delivery, null);
    });

    it('works for an administrator account too (it is just a signed-in user)', async () => {
      await testDb.pool.query('INSERT INTO carts (user_id) VALUES (?)', [ADMIN]);
      const [[{ id }]] = await testDb.pool.query('SELECT id FROM carts WHERE user_id = ?', [ADMIN]);
      await testDb.pool.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, 2, 1)', [id]);
      try {
        assert.equal((await api.put('/api/checkout/delivery', validDelivery(), { user: ADMIN })).status, 200);
      } finally {
        await testDb.pool.query('DELETE FROM carts WHERE user_id = ?', [ADMIN]);
      }
    });
  });
});
