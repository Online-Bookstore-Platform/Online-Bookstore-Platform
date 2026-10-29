/*
 * System / security / regression tests derived from the Software Test Plan (STP v1.0).
 *
 * Every test name starts with the STP test-case id it executes (TC-AUTH-01, TC-CART-02, ...), so the
 * output of `npm test` can be copied straight into the test execution record in
 * docs/TEST_EXECUTION_REPORT.md.
 *
 * What is real here: the whole Express app (`createApp`, the same wiring as src/server.js), a
 * throw-away MySQL database built from database/schema.sql, real sessions, real bcrypt hashing,
 * real payment/order/inventory transactions.
 * What is not: the external book providers (Open Library / Google Books) are forced offline so the
 * run is deterministic and needs no internet, and the payment "gateway" is the project's internal
 * provider (FOLIO_CHECKOUT_OUTCOME), exactly as the application ships it.
 *
 * Known defects are written as `todo` tests: they describe the behaviour the SRS requires, run on
 * every build, do not fail the suite, and start passing (and can be promoted to normal tests) as
 * soon as the defect is fixed. See the defect log in docs/TEST_EXECUTION_REPORT.md.
 *
 * Rate-limit note: the login limiter allows 10 attempts and the registration limiter 5 per 15 minutes
 * per IP, and both live for the lifetime of the process. Only a handful of tests use the real login /
 * registration endpoints for that reason; every other test is signed in through a session record
 * created directly in the session store, which is exactly what a successful login produces.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import session from 'express-session';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/features/varchas/authentication/password.js';
import { createMySqlBooksRepository } from '../../src/features/varchas/book-details/mysql-books.repository.js';
import { createMySqlPaymentsRepository } from '../../src/features/varchas/payments/mysql-payments.repository.js';
import { createMySqlPasswordResetRepository } from '../../src/features/varchas/authentication/mysql-password-reset.repository.js';
import { createVrindaOrderService } from '../../src/features/vrinda/orders/orders.service.js';
import { createFixtures, createTestDatabase, databaseTests } from '../uditi/helpers.js';

const SECRET = 'stp-system-test-secret';
const PASSWORD = 'Str0ng-Passw0rd!';
const DELIVERY = {
  recipientName: 'Test Reader', phone: '9876543210', addressLine1: '12 MG Road', addressLine2: 'Flat 4B',
  city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India',
};

describe('STP system tests (real app, real MySQL)', databaseTests, () => {
  let testDb; let db; let f; let store; let realFetch;
  const servers = [];
  const ids = {};

  /** Boot the real app (same wiring as src/server.js) on a random port. */
  async function startApp(outcome = 'approved') {
    const users = {
      async findByEmail(email) {
        const [rows] = await db.query('SELECT id, name, email, role, password_hash AS passwordHash FROM users WHERE email = ? LIMIT 1', [email]);
        return rows[0] ?? null;
      },
      async findById(id) {
        const [rows] = await db.query('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1', [id]);
        return rows[0] ?? null;
      },
      ...createMySqlPasswordResetRepository(db),
    };
    const repositories = {
      users,
      books: createMySqlBooksRepository(db),
      payments: createMySqlPaymentsRepository(db),
      orders: createVrindaOrderService({ pool: db }),
    };
    const app = createApp({ repositories, pool: db, sessionStore: store, sessionSecret: SECRET, env: { ...process.env, NODE_ENV: 'test', FOLIO_CHECKOUT_OUTCOME: outcome } });
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  }

  /** A signed-in session, created the way a successful login creates it. */
  async function sessionFor(userId) {
    const sid = randomUUID();
    await new Promise((resolve, reject) => store.set(sid, { cookie: { originalMaxAge: 3_600_000, httpOnly: true, path: '/', sameSite: 'strict' }, userId }, error => (error ? reject(error) : resolve())));
    const signature = createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
    return `folio.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`;
  }

  /** Small HTTP client: optional cookie, JSON in/out. */
  function api(base, cookie = '') {
    let jar = cookie;
    async function call(method, path, body, headers = {}) {
      const response = await fetch(base + path, {
        method, redirect: 'manual',
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(jar ? { cookie: jar } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      for (const setCookie of response.headers.getSetCookie?.() ?? []) {
        const [pair] = setCookie.split(';');
        const [name] = pair.split('=');
        jar = jar.split('; ').filter(part => part && !part.startsWith(`${name}=`)).concat(pair).join('; ');
      }
      const text = await response.text();
      let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
      return { status: response.status, json, text, headers: response.headers, cookie: jar };
    }
    return {
      get: (path, headers) => call('GET', path, undefined, headers),
      post: (path, body = {}, headers) => call('POST', path, body, headers),
      put: (path, body, headers) => call('PUT', path, body, headers),
      patch: (path, body, headers) => call('PATCH', path, body, headers),
      del: (path, headers) => call('DELETE', path, undefined, headers),
      get cookie() { return jar; },
    };
  }

  const stock = async bookId => Number((await db.query('SELECT quantity FROM inventory WHERE book_id = ?', [bookId]))[0][0].quantity);
  const count = async (sqlText, params = []) => Number((await db.query(sqlText, params))[0][0].n);
  const draft = (client, extra = {}, key = randomUUID()) => client.post('/api/orders/draft', { delivery: DELIVERY, ...extra }, { 'Idempotency-Key': key });
  const pay = (client, orderId, key = randomUUID()) => client.post(`/api/payments/orders/${orderId}`, {}, { 'Idempotency-Key': key });
  const sortedTitles = books => books.map(book => book.title);

  /** Give a customer a fresh cart containing the given lines and return a client. */
  async function customerWith(base, lines) {
    const userId = await f.addUser();
    await db.query('DELETE ci FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = ?', [userId]);
    if (lines.length) await f.fillCart(userId, lines);
    return { userId, client: api(base, await sessionFor(userId)) };
  }

  before(async () => {
    realFetch = globalThis.fetch;
    // External providers offline -> deterministic, no internet needed. Local requests pass through.
    globalThis.fetch = (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      return url.hostname === '127.0.0.1' ? realFetch(input, init) : Promise.resolve(new Response('provider offline', { status: 503 }));
    };
    testDb = await createTestDatabase();
    db = testDb.pool;
    f = createFixtures(db);
    store = new session.MemoryStore();

    const classics = (await db.query("INSERT INTO categories (name) VALUES ('Classics')"))[0].insertId;
    const mystery = (await db.query("INSERT INTO categories (name) VALUES ('Mystery')"))[0].insertId;
    ids.classics = classics; ids.mystery = mystery;
    ids.pride = await f.addBook({ title: 'Pride and Prejudice', author: 'Jane Austen', isbn: '9780141439518', price: 299, quantity: 20, category_id: classics });
    ids.emma = await f.addBook({ title: 'Emma', author: 'Jane Austen', isbn: '9780141439587', price: 249, quantity: 5, category_id: classics });
    ids.moby = await f.addBook({ title: 'Moby-Dick', author: 'Herman Melville', isbn: '9780142437247', price: 399, quantity: 0, category_id: classics });
    ids.hound = await f.addBook({ title: 'The Hound of the Baskervilles', author: 'Arthur Conan Doyle', isbn: '9780140437867', price: 199, quantity: 12, category_id: mystery });
    ids.moonstone = await f.addBook({ title: 'The Moonstone', author: 'Wilkie Collins', isbn: '9780140434088', price: 329, quantity: 8, category_id: mystery });

    ids.admin = await f.addUser({ name: 'Store Admin', email: 'admin@stp.example', role: 'admin', password_hash: await hashPassword(PASSWORD) });
    ids.asha = await f.addUser({ name: 'Asha Rao', email: 'asha@stp.example', phone: '9876543210', password_hash: await hashPassword(PASSWORD) });
    ids.base = await startApp('approved');
    ids.baseDeclined = await startApp('declined');
    ids.baseCancelled = await startApp('cancelled');
    ids.baseTimeout = await startApp('timeout');
  });

  after(async () => {
    globalThis.fetch = realFetch;
    for (const server of servers) await new Promise(resolve => server.close(resolve));
    await testDb.drop();
  });

  // ---------------------------------------------------------------- SRS 5.1 Customer accounts / SEC-1, SEC-2, SEC-5
  describe('SRS 5.1 customer accounts and authentication', () => {
    it('TC-AUTH-01 valid registration creates a customer with a hashed password, then the customer can sign in', async () => {
      const client = api(ids.base);
      const email = 'new.reader@stp.example';
      const registered = await client.post('/api/users/register', { name: 'New Reader', email, phone: '9123456780', password: PASSWORD, confirmPassword: PASSWORD, acceptedTerms: true });
      assert.equal(registered.status, 201, registered.text);
      const [[row]] = await db.query('SELECT role, password_hash FROM users WHERE email = ?', [email]);
      assert.equal(row.role, 'customer', 'self-registration can never create an administrator');
      assert.match(row.password_hash, /^\$2[aby]\$\d{2}\$/, 'bcrypt hash');
      assert.ok(!row.password_hash.includes(PASSWORD), 'password is not stored in plain text');
      const login = await client.post('/api/auth/login', { email, password: PASSWORD });
      assert.equal(login.status, 200);
      assert.equal(login.json.user.email, email);
      assert.equal((await client.get('/api/auth/me')).json.user.role, 'customer');
    });

    it('TC-AUTH-01 (negative) registration rejects weak or mismatched passwords, missing terms and duplicate emails', async () => {
      const client = api(ids.base);
      const good = { name: 'Neg Tester', email: 'neg@stp.example', password: PASSWORD, confirmPassword: PASSWORD, acceptedTerms: true };
      const fieldsOf = response => response.json?.error?.details?.map(detail => detail.field) ?? [];
      assert.deepEqual(fieldsOf(await client.post('/api/users/register', { ...good, password: 'short', confirmPassword: 'short' })), ['password']);
      assert.deepEqual(fieldsOf(await client.post('/api/users/register', { ...good, confirmPassword: 'different' })), ['confirmPassword']);
      assert.deepEqual(fieldsOf(await client.post('/api/users/register', { ...good, acceptedTerms: false })), ['acceptedTerms']);
      const duplicate = await client.post('/api/users/register', { ...good, email: 'asha@stp.example' });
      assert.ok([400, 409].includes(duplicate.status), `duplicate email must be refused, got ${duplicate.status}`);
      assert.equal(await count("SELECT COUNT(*) AS n FROM users WHERE email = 'neg@stp.example'"), 0);
      assert.equal(await count("SELECT COUNT(*) AS n FROM users WHERE email = 'asha@stp.example'"), 1);
    });

    it('TC-AUTH-02 invalid credentials get one generic answer (no account enumeration) and no session', async () => {
      const wrongPassword = await api(ids.base).post('/api/auth/login', { email: 'asha@stp.example', password: 'wrong-password-1' });
      const unknownEmail = await api(ids.base).post('/api/auth/login', { email: 'nobody@stp.example', password: 'wrong-password-1' });
      assert.equal(wrongPassword.status, 401);
      assert.equal(unknownEmail.status, 401);
      assert.equal(wrongPassword.json.error.code, 'INVALID_CREDENTIALS');
      assert.deepEqual(wrongPassword.json, unknownEmail.json, 'identical answer for a wrong password and an unknown email');
      assert.equal(wrongPassword.headers.getSetCookie().length, 0, 'no session cookie is issued on failure');
      assert.equal((await api(ids.base).post('/api/auth/login', { email: "' OR '1'='1", password: "' OR '1'='1" })).status, 400);
    });

    it('TC-AUTH-03 protected pages and APIs require sign-in', async () => {
      const anon = api(ids.base);
      for (const path of ['/api/cart', '/api/orders', '/api/orders/1', '/api/profile', '/api/checkout/summary', '/api/payments/1', '/api/admin/books', '/api/inventory/stock', '/api/auth/me']) {
        const response = await anon.get(path);
        assert.equal(response.status, 401, `${path} -> ${response.status}`);
      }
      assert.equal((await anon.post('/api/cart/items', { bookId: ids.pride, quantity: 1 })).status, 401);
      assert.equal((await anon.post('/api/orders/draft', { delivery: DELIVERY })).status, 401);
      assert.equal((await anon.post(`/api/payments/orders/1`, {}, { 'Idempotency-Key': 'k' })).status, 401);
    });

    it('SEC-5 logout invalidates the session (a stolen cookie stops working) and the cookie is HttpOnly + SameSite=Strict', async () => {
      const client = api(ids.base);
      const login = await client.post('/api/auth/login', { email: 'asha@stp.example', password: PASSWORD });
      assert.equal(login.status, 200);
      const cookieHeader = login.headers.getSetCookie().join(' ');
      assert.match(cookieHeader, /HttpOnly/i);
      assert.match(cookieHeader, /SameSite=Strict/i);
      const stolen = client.cookie;
      assert.equal((await client.get('/api/auth/me')).status, 200);
      assert.equal((await client.post('/api/auth/logout')).status, 204);
      assert.equal((await api(ids.base, stolen).get('/api/auth/me')).status, 401, 'the old cookie no longer authenticates');
    });

    it('SEC-1 brute-force protection: the login endpoint is rate limited (10 attempts / 15 min)', async () => {
      const response = await api(ids.base).post('/api/auth/login', { email: 'asha@stp.example', password: 'wrong-password-2' });
      assert.match(response.headers.get('ratelimit-policy') ?? '', /^10;w=900/);
    });
  });

  // ---------------------------------------------------------------- SRS 5.2 Catalogue and search
  describe('SRS 5.2 catalogue and search (providers offline, store catalogue)', () => {
    const list = async (query = '') => { const r = await api(ids.base).get(`/api/catalogue/books${query}`); assert.equal(r.status, 200, r.text); return r.json; };

    it('TC-CAT-01 search by title (partial, case-insensitive)', async () => {
      assert.deepEqual(sortedTitles((await list('?q=PRIDE')).books), ['Pride and Prejudice']);
      assert.deepEqual(sortedTitles((await list('?q=moon')).books), ['The Moonstone']);
    });

    it('TC-CAT-02 search by author, and by ISBN (with or without hyphens)', async () => {
      assert.deepEqual(sortedTitles((await list('?q=austen')).books).sort(), ['Emma', 'Pride and Prejudice']);
      assert.deepEqual(sortedTitles((await list('?q=9780140437867')).books), ['The Hound of the Baskervilles']);
      assert.deepEqual(sortedTitles((await list('?q=978-0-14-043786-7')).books), ['The Hound of the Baskervilles']);
    });

    it('TC-CAT-03 category filter, price range, availability, sorting and paging', async () => {
      // Category ids are the positions in the storefront's category list: 4 = Mystery, 17 = Classics.
      const mysteryBooks = await list('?category=4');
      const classics = await list('?category=17');
      assert.deepEqual(sortedTitles(classics.books).sort(), ['Emma', 'Moby-Dick', 'Pride and Prejudice']);
      assert.deepEqual(sortedTitles(mysteryBooks.books).sort(), ['The Hound of the Baskervilles', 'The Moonstone']);
      assert.deepEqual(sortedTitles((await list('?minPrice=250&maxPrice=330')).books).sort(), ['Pride and Prejudice', 'The Moonstone']);
      assert.deepEqual(sortedTitles((await list('?availability=out_of_stock')).books), ['Moby-Dick']);
      assert.ok(!sortedTitles((await list('?availability=in_stock')).books).includes('Moby-Dick'));
      assert.deepEqual(sortedTitles((await list('?sort=price&order=asc')).books), ['The Hound of the Baskervilles', 'Emma', 'Pride and Prejudice', 'The Moonstone', 'Moby-Dick']);
      assert.deepEqual(sortedTitles((await list('?sort=title&order=desc')).books)[0], 'The Moonstone');
      const first = await list('?pageSize=2&page=1');
      const second = await list('?pageSize=2&page=2');
      assert.equal(first.pagination.totalItems, 5);
      assert.equal(first.pagination.totalPages, 3);
      assert.equal(new Set([...sortedTitles(first.books), ...sortedTitles(second.books)]).size, 4, 'no book repeats across pages');
    });

    it('TC-CAT-03 (negative) invalid filters and paging are rejected with a clear 400', async () => {
      for (const query of ['?minPrice=-1', '?availability=bogus', '?category=99', '?sort=password', '?page=0', '?pageSize=500', `?q=${'x'.repeat(101)}`]) {
        const response = await api(ids.base).get(`/api/catalogue/books${query}`);
        assert.equal(response.status, 400, `${query} -> ${response.status}`);
      }
    });

    it('TC-CAT-04 browsing keeps working when the book discovery providers are down (store catalogue is shown with a notice)', async () => {
      const body = await list();
      assert.equal(body.source, 'local');
      assert.match(body.providerNotice, /local catalogue/i);
      assert.equal(body.pagination.totalItems, 5);
      assert.ok(body.books.every(book => book.storeProduct?.id && book.price > 0), 'every store book can be bought');
    });

    it('SEC-1 search input is never executed as SQL', async () => {
      for (const q of ["' OR 1=1 --", '"; DROP TABLE books; --', "%' UNION SELECT password_hash FROM users --"]) {
        const response = await api(ids.base).get(`/api/catalogue/books?q=${encodeURIComponent(q)}`);
        assert.ok([200, 502].includes(response.status), `${q} -> ${response.status}`);
        assert.ok(!/\$2[aby]\$/.test(response.text), 'no password hash can leak');
      }
      assert.equal(await count('SELECT COUNT(*) AS n FROM books'), 5, 'tables are intact');
    });

    it('TC-CAT-05 book details are public and an unknown or removed book is a clean 404', async () => {
      const found = await api(ids.base).get(`/api/books/${ids.pride}`);
      assert.equal(found.status, 200);
      assert.equal(found.json.book.title, 'Pride and Prejudice');
      assert.equal((await api(ids.base).get('/api/books/999999')).status, 404);
    });
  });

  // ---------------------------------------------------------------- SRS 5.3 Shopping cart
  describe('SRS 5.3 shopping cart', () => {
    it('TC-CART-01 add item: price and stock come from the catalogue; adding again increases the same line', async () => {
      const { client } = await customerWith(ids.base, []);
      const added = await client.post('/api/cart/items', { bookId: ids.pride, quantity: 2 });
      assert.equal(added.status, 201, added.text);
      assert.equal(added.json.cart.items[0].quantity, 2);
      assert.equal(added.json.cart.items[0].unitPrice, 299);
      const again = await client.post('/api/cart/items', { bookId: ids.pride, quantity: 1 });
      assert.equal(again.json.cart.items.length, 1);
      assert.equal(again.json.cart.items[0].quantity, 3);
      assert.equal(again.json.cart.totals.subtotal, 897);
    });

    it('TC-CART-02 quantity update recalculates totals; the cart survives a new session', async () => {
      const { userId, client } = await customerWith(ids.base, [{ bookId: ids.pride, quantity: 1 }, { bookId: ids.hound, quantity: 1 }]);
      const updated = await client.patch(`/api/cart/items/${ids.pride}`, { quantity: 4 });
      assert.equal(updated.status, 200, updated.text);
      assert.equal(updated.json.cart.totals.subtotal, 4 * 299 + 199);
      const fresh = api(ids.base, await sessionFor(userId));
      assert.equal((await fresh.get('/api/cart')).json.cart.itemCount, 5, 'the cart is stored on the server');
    });

    it('TC-CART-03 remove item; removing something that is not in the cart is a 404', async () => {
      const { client } = await customerWith(ids.base, [{ bookId: ids.pride, quantity: 1 }, { bookId: ids.hound, quantity: 1 }]);
      const removed = await client.del(`/api/cart/items/${ids.pride}`);
      assert.equal(removed.status, 200);
      assert.deepEqual(removed.json.cart.items.map(item => item.bookId), [ids.hound]);
      assert.equal((await client.del(`/api/cart/items/${ids.pride}`)).status, 404);
    });

    it('TC-CART-04 (negative/boundary) invalid quantities, unknown books, out-of-stock books and more than the stock are refused', async () => {
      const { client } = await customerWith(ids.base, []);
      for (const quantity of [0, -1, 1.5, 'abc', 1e21]) {
        const response = await client.post('/api/cart/items', { bookId: ids.pride, quantity });
        assert.ok([400, 409].includes(response.status), `quantity ${quantity} -> ${response.status}`);
        assert.equal(response.json.error.code === 'VALIDATION_ERROR' || response.json.error.code === 'INSUFFICIENT_STOCK', true, response.text);
      }
      assert.equal((await client.post('/api/cart/items', { bookId: 999999, quantity: 1 })).status, 409);
      const outOfStock = await client.post('/api/cart/items', { bookId: ids.moby, quantity: 1 });
      assert.equal(outOfStock.status, 409);
      assert.equal(outOfStock.json.error.code, 'BOOK_UNAVAILABLE');
      const tooMany = await client.post('/api/cart/items', { bookId: ids.emma, quantity: 6 });
      assert.equal(tooMany.status, 409);
      assert.equal(tooMany.json.error.code, 'INSUFFICIENT_STOCK');
      assert.equal((await client.get('/api/cart')).json.cart.itemCount, 0, 'nothing was added by the refused requests');
    });

    it('SEC-8 one customer can never read or change another customer’s cart', async () => {
      const a = await customerWith(ids.base, [{ bookId: ids.pride, quantity: 1 }]);
      const b = await customerWith(ids.base, [{ bookId: ids.hound, quantity: 2 }]);
      assert.deepEqual((await a.client.get('/api/cart')).json.cart.items.map(item => item.bookId), [ids.pride]);
      assert.deepEqual((await b.client.get('/api/cart')).json.cart.items.map(item => item.bookId), [ids.hound]);
      assert.equal((await a.client.del(`/api/cart/items/${ids.hound}`)).status, 404, 'a cannot remove b’s line');
      assert.equal((await b.client.get('/api/cart')).json.cart.itemCount, 2);
    });
  });

  // ---------------------------------------------------------------- SRS 5.4 Checkout
  describe('SRS 5.4 checkout and delivery', () => {
    it('TC-CHK-01 delivery details are validated, tidied and saved; TC-CHK-02 the order summary is recalculated by the server', async () => {
      const { client } = await customerWith(ids.base, [{ bookId: ids.pride, quantity: 2 }, { bookId: ids.hound, quantity: 1 }]);
      const before = await client.get('/api/checkout/summary');
      assert.equal(before.status, 200);
      assert.equal(before.json.checkout.canProceed, false, 'no delivery details yet');
      const saved = await client.put('/api/checkout/delivery', { ...DELIVERY, phone: '+91 98765-43210', recipientName: '  Test   Reader ' });
      assert.equal(saved.status, 200, saved.text);
      assert.equal(saved.json.delivery.phone, '+919876543210');
      assert.equal(saved.json.delivery.recipientName, 'Test Reader');
      const summary = (await client.get('/api/checkout/summary')).json.checkout;
      assert.equal(summary.totals.subtotal, 2 * 299 + 199);
      assert.equal(summary.totals.total, summary.totals.subtotal);
      assert.equal(summary.canProceed, true);
      await db.query('UPDATE books SET price = 310.5 WHERE id = ?', [ids.pride]);
      assert.equal((await client.get('/api/checkout/summary')).json.checkout.totals.subtotal, 2 * 310.5 + 199, 'a price change is picked up, never a stale browser value');
      await db.query('UPDATE books SET price = 299 WHERE id = ?', [ids.pride]);
    });

    it('TC-CHK-03 (negative) invalid delivery input is rejected field by field', async () => {
      const { client } = await customerWith(ids.base, [{ bookId: ids.pride, quantity: 1 }]);
      const fields = async body => (await client.put('/api/checkout/delivery', body)).json?.error?.details?.map(detail => detail.field).sort();
      assert.deepEqual(await fields({}), ['addressLine1', 'city', 'country', 'phone', 'postalCode', 'recipientName', 'state']);
      assert.deepEqual(await fields({ ...DELIVERY, postalCode: '12' }), ['postalCode']);
      assert.deepEqual(await fields({ ...DELIVERY, phone: 'call me' }), ['phone']);
      assert.deepEqual(await fields({ ...DELIVERY, city: '<script>alert(1)</script>'.slice(0, 1) }), ['city']);
      assert.equal((await draft(client, { delivery: { ...DELIVERY, postalCode: '12' } })).status, 400, 'an order cannot be created with invalid delivery details');
    });

    it('TC-CHK-03 (negative) an empty cart cannot be checked out', async () => {
      const { client } = await customerWith(ids.base, []);
      const response = await draft(client);
      assert.equal(response.status, 409);
      assert.equal(response.json.error.code, 'EMPTY_CART');
      assert.equal(await count('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?', [(await db.query('SELECT id FROM users ORDER BY id DESC LIMIT 1'))[0][0].id]), 0);
    });
  });

  // ---------------------------------------------------------------- SRS 5.5 Payment, 5.6 Orders, 5.7 Inventory
  describe('SRS 5.5 payment, SRS 5.6 orders, SRS 5.7 / BR-1 inventory', () => {
    it('TC-PAY-01 / TC-ORD-01 / TC-INV-01 successful purchase: order id, paid status, history, stock decremented, cart cleared', async () => {
      const startStock = await stock(ids.hound);
      const { userId, client } = await customerWith(ids.base, [{ bookId: ids.hound, quantity: 2 }]);
      const created = await draft(client);
      assert.equal(created.status, 201, created.text);
      const order = created.json.order;
      assert.equal(order.status, 'pending');
      assert.equal(order.totalAmount, 398);
      assert.ok(order.orderNumber && order.orderNumber.length >= 4, 'a customer-facing order id exists');
      assert.equal(await stock(ids.hound), startStock, 'creating an order does not take stock yet');
      assert.equal((await client.get('/api/cart')).json.cart.itemCount, 0, 'the cart is emptied by the order');

      const paid = await pay(client, order.id);
      assert.equal(paid.status, 201, paid.text);
      assert.equal(paid.json.attempt.status, 'succeeded');
      assert.equal(paid.json.attempt.amount, 398, 'the amount charged is the server-side order total');
      assert.equal(await stock(ids.hound), startStock - 2, 'TC-INV-01 stock decreases by the purchased quantity');
      const detail = (await client.get(`/api/orders/${order.id}`)).json.order;
      assert.equal(detail.status, 'paid');
      assert.deepEqual(detail.statusHistory.map(entry => entry.toStatus), ['pending', 'paid']);
      assert.equal(detail.items[0].unitPrice, 199);
      assert.equal(await count("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status = 'paid'", [userId]), 1);
    });

    it('TC-ORD-01 every order gets its own unique order id', async () => {
      const seen = new Set();
      for (let i = 0; i < 3; i += 1) {
        const { client } = await customerWith(ids.base, [{ bookId: ids.pride, quantity: 1 }]);
        seen.add((await draft(client)).json.order.orderNumber);
      }
      assert.equal(seen.size, 3);
    });

    it('TC-PAY-02 declined, cancelled and timed-out payments leave the order unpaid, stock untouched and the customer able to retry', async () => {
      for (const [base, status] of [[ids.baseDeclined, 'failed'], [ids.baseCancelled, 'cancelled'], [ids.baseTimeout, 'timed_out']]) {
        const before = await stock(ids.moonstone);
        const { userId, client } = await customerWith(base, [{ bookId: ids.moonstone, quantity: 1 }]);
        const order = (await draft(client)).json.order;
        const failed = await pay(client, order.id);
        assert.equal(failed.json.attempt.status, status, failed.text);
        assert.equal(await stock(ids.moonstone), before, `${status}: stock is unchanged`);
        assert.notEqual((await client.get(`/api/orders/${order.id}`)).json.order.status, 'paid');
        assert.equal(await count("SELECT COUNT(*) AS n FROM payments WHERE order_id = ? AND status = 'succeeded'", [order.id]), 0);
        // The same order can be paid later (here through an instance whose payment succeeds).
        const retryClient = api(ids.base, await sessionFor(userId));
        const retried = await pay(retryClient, order.id);
        assert.equal(retried.json.attempt.status, 'succeeded', `${status}: retry -> ${retried.text}`);
        assert.equal(await stock(ids.moonstone), before - 1);
      }
    });

    it('TC-PAY-03 / SEC-7 duplicate payment request, double payment, card data and missing idempotency key', async () => {
      const { client } = await customerWith(ids.base, [{ bookId: ids.hound, quantity: 1 }]);
      const order = (await draft(client)).json.order;
      assert.equal((await client.post(`/api/payments/orders/${order.id}`, {})).status, 400, 'an Idempotency-Key header is required');
      const cardData = await client.post(`/api/payments/orders/${order.id}`, { cardNumber: '4111111111111111', cvv: '123' }, { 'Idempotency-Key': randomUUID() });
      assert.equal(cardData.status, 400);
      assert.equal(cardData.json.error.code, 'PAYMENT_DATA_NOT_ACCEPTED', 'raw card data is refused, never stored');

      const key = randomUUID();
      const before = await stock(ids.hound);
      const [first, second] = await Promise.all([pay(client, order.id, key), pay(client, order.id, key)]);
      assert.deepEqual([first.status, second.status].sort(), [200, 201], 'one creates, the duplicate reuses');
      assert.equal(first.json.attempt.id, second.json.attempt.id);
      const later = await pay(client, order.id, randomUUID());
      assert.ok(later.status >= 400, 'an already-paid order cannot be paid again');
      assert.equal(await count("SELECT COUNT(*) AS n FROM payments WHERE order_id = ? AND status = 'succeeded'", [order.id]), 1, 'exactly one successful payment');
      assert.equal(await stock(ids.hound), before - 1, 'stock was deducted once');
      const columns = await count("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND (column_name LIKE '%card%' OR column_name LIKE '%cvv%' OR column_name LIKE '%expiry%')");
      assert.equal(columns, 0, 'the schema has nowhere to keep card data');
    });

    it('TC-PAY-03 an idempotency key cannot be reused by another customer, and nobody can pay or read another customer’s order', async () => {
      const a = await customerWith(ids.base, [{ bookId: ids.hound, quantity: 1 }]);
      const b = await customerWith(ids.base, [{ bookId: ids.hound, quantity: 1 }]);
      const orderA = (await draft(a.client)).json.order;
      const key = randomUUID();
      assert.equal((await pay(a.client, orderA.id, key)).status, 201);
      assert.equal((await pay(b.client, orderA.id, randomUUID())).status, 404, 'b cannot pay a’s order');
      assert.equal((await pay(b.client, orderA.id, key)).status, 409, 'b cannot reuse a’s key');
      assert.equal((await b.client.get(`/api/orders/${orderA.id}`)).status, 404);
      assert.equal((await b.client.get(`/api/orders/${orderA.id}/tracking`)).status, 404);
      assert.equal((await b.client.get(`/api/payments/${(await a.client.get(`/api/orders/${orderA.id}`)).json.order.paymentAttempts?.[0]?.id ?? 1}`)).status, 404);
    });

    it('TC-ORD-02 order history lists only the customer’s own orders, newest first; TC-ORD-03 tracking shows the status timeline', async () => {
      const { client } = await customerWith(ids.base, [{ bookId: ids.pride, quantity: 1 }]);
      const first = (await draft(client)).json.order;
      await f.fillCart((await db.query('SELECT user_id FROM orders WHERE id = ?', [first.id]))[0][0].user_id, [{ bookId: ids.hound, quantity: 1 }]);
      const second = (await draft(client)).json.order;
      const history = (await client.get('/api/orders')).json.orders;
      assert.deepEqual(history.map(order => order.id), [second.id, first.id]);
      const tracking = (await client.get(`/api/orders/${first.id}/tracking`)).json.tracking;
      assert.equal(tracking.order.status, 'pending');
      assert.ok(tracking.order.statusHistory.length >= 1);
      assert.equal((await client.get('/api/orders/999999')).status, 404);
      assert.equal((await client.get('/api/orders/abc')).status, 400);
    });

    it('BR-3 a later price change never alters an order that already exists', async () => {
      const { client } = await customerWith(ids.base, [{ bookId: ids.emma, quantity: 1 }]);
      const order = (await draft(client)).json.order;
      await db.query('UPDATE books SET price = 999 WHERE id = ?', [ids.emma]);
      const detail = (await client.get(`/api/orders/${order.id}`)).json.order;
      assert.equal(detail.totalAmount, 249);
      assert.equal(detail.items[0].unitPrice, 249);
      await db.query('UPDATE books SET price = 249 WHERE id = ?', [ids.emma]);
    });

    it('TC-INV-02 / BR-1 stock that disappears between checkout and payment blocks the purchase, with nothing charged or deducted', async () => {
      const book = await f.addBook({ title: 'Last Copies', price: 100, quantity: 3 });
      const { client } = await customerWith(ids.base, [{ bookId: book, quantity: 3 }]);
      const order = (await draft(client)).json.order;
      await db.query('UPDATE inventory SET quantity = 1 WHERE book_id = ?', [book]);
      const paid = await pay(client, order.id);
      assert.equal(paid.status, 409, paid.text);
      assert.equal(paid.json.error.code, 'INSUFFICIENT_STOCK');
      assert.equal(await stock(book), 1, 'stock is unchanged');
      assert.equal((await client.get(`/api/orders/${order.id}`)).json.order.status === 'paid', false, 'the order is not confirmed');
      assert.equal(await count("SELECT COUNT(*) AS n FROM payments WHERE order_id = ? AND status = 'succeeded'", [order.id]), 0);
    });

    it('TC-INV-03 concurrent buyers of the last copy: exactly one wins, stock never goes negative', async () => {
      const book = await f.addBook({ title: 'The Very Last Copy', price: 150, quantity: 1 });
      const buyers = await Promise.all([1, 2, 3, 4].map(() => customerWith(ids.base, [{ bookId: book, quantity: 1 }])));
      const drafts = await Promise.all(buyers.map(buyer => draft(buyer.client)));
      const orders = drafts.map(d => d.json.order);
      assert.deepEqual(drafts.map(d => d.status), [201, 201, 201, 201], 'simultaneous checkouts of the same book all get an order (no deadlock error)');
      const results = await Promise.all(buyers.map((buyer, index) => pay(buyer.client, orders[index].id)));
      assert.equal(results.filter(result => result.status === 201 && result.json.attempt.status === 'succeeded').length, 1, 'exactly one purchase succeeds');
      assert.equal(await stock(book), 0);
      assert.equal(await count("SELECT COUNT(*) AS n FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE oi.book_id = ? AND o.status = 'paid'", [book]), 1);
      assert.equal(await count("SELECT COUNT(*) AS n FROM payments p JOIN order_items oi ON oi.order_id = p.order_id WHERE oi.book_id = ? AND p.status = 'succeeded'", [book]), 1);
      assert.ok(results.filter(result => result.status !== 201).every(result => result.status === 409), 'the others are told the book ran out');
    });
  });

  // ---------------------------------------------------------------- SRS 5.8 / SEC-8 Administrator
  describe('SRS 5.8 / SEC-8 administrator operations and access control', () => {
    it('TC-ADM-01 an administrator signs in and has the admin role; SEC-8 customers are refused every admin route', async () => {
      const admin = api(ids.base);
      const login = await admin.post('/api/auth/login', { email: 'admin@stp.example', password: PASSWORD });
      assert.equal(login.status, 200);
      assert.equal(login.json.user.role, 'admin');
      const customer = api(ids.base, await sessionFor(ids.asha));
      const requests = [
        ['get', '/api/admin/books'], ['post', '/api/admin/books', { title: 'x' }], ['patch', `/api/admin/books/${ids.pride}`, { price: 1 }], ['del', `/api/admin/books/${ids.pride}`],
        ['get', '/api/inventory/stock'], ['get', `/api/inventory/stock/${ids.pride}`], ['put', `/api/inventory/stock/${ids.pride}`, { quantity: 1 }], ['patch', `/api/inventory/stock/${ids.pride}`, { change: 1 }],
      ];
      for (const [method, path, body] of requests) {
        const response = await customer[method](path, body);
        assert.equal(response.status, 403, `customer ${method.toUpperCase()} ${path} -> ${response.status}`);
      }
      assert.equal(await stock(ids.pride), 20, 'the refused customer requests changed nothing');
    });

    it('TC-ADM-02 book create / update / price change / remove, with validation; removed books leave the catalogue but keep old orders intact', async () => {
      const admin = api(ids.base, await sessionFor(ids.admin));
      const body = { title: 'Admin Created', author: 'A. Admin', category: 'Classics', description: 'Created by the system test', price: 123.5, isbn: '9780306406157' };
      const created = await admin.post('/api/admin/books', body);
      assert.equal(created.status, 201, created.text);
      const bookId = created.json.book.id;
      assert.equal(await count('SELECT COUNT(*) AS n FROM inventory WHERE book_id = ?', [bookId]), 1, 'a new book gets its stock row');
      assert.equal(sortedTitles((await api(ids.base).get('/api/catalogue/books?q=Admin%20Created')).json.books)[0], 'Admin Created');

      assert.equal((await admin.post('/api/admin/books', { ...body, isbn: undefined, price: -5 })).status, 400, 'negative price');
      assert.equal((await admin.post('/api/admin/books', { title: 'No details' })).status, 400, 'missing fields');
      assert.equal((await admin.post('/api/admin/books', { ...body, isbn: undefined, price: 0 })).status, 400, 'zero price');

      const priced = await admin.patch(`/api/admin/books/${bookId}`, { price: 150 });
      assert.equal(priced.status, 200);
      assert.equal(priced.json.book.price, 150);

      const buyer = await customerWith(ids.base, [{ bookId, quantity: 1 }]);
      await admin.put(`/api/inventory/stock/${bookId}`, { quantity: 5 });
      const order = (await draft(buyer.client)).json.order;
      assert.equal((await admin.del(`/api/admin/books/${bookId}`)).status, 204);
      assert.equal((await api(ids.base).get(`/api/books/${bookId}`)).status, 404, 'a removed book is no longer shown');
      assert.equal((await buyer.client.get(`/api/orders/${order.id}`)).json.order.items[0].title, 'Admin Created', 'the order still shows what was bought');
    });

    it('TC-ADM-03 stock: set an exact count or add/remove copies; below zero is refused; every change is audited', async () => {
      const admin = api(ids.base, await sessionFor(ids.admin));
      const book = await f.addBook({ quantity: 7 });
      const set = await admin.put(`/api/inventory/stock/${book}`, { quantity: 40, reason: 'stock-take' });
      assert.equal(set.status, 200);
      assert.equal(set.json.stock.quantity, 40);
      assert.equal((await admin.patch(`/api/inventory/stock/${book}`, { change: -15 })).json.stock.quantity, 25);
      const below = await admin.patch(`/api/inventory/stock/${book}`, { change: -26 });
      assert.equal(below.status, 409);
      assert.equal(below.json.error.code, 'STOCK_BELOW_ZERO');
      assert.equal((await admin.put(`/api/inventory/stock/${book}`, { quantity: -1 })).status, 400);
      assert.equal((await admin.put(`/api/inventory/stock/${book}`, { quantity: 1.5 })).status, 400);
      assert.equal(await stock(book), 25);
      assert.equal(await count('SELECT COUNT(*) AS n FROM inventory_adjustments WHERE book_id = ? AND admin_id = ?', [book, ids.admin]), 2, 'each successful change is recorded with who made it');
    });
  });

  // ---------------------------------------------------------------- Non-functional spot checks
  describe('NFR spot checks (small scale, local machine)', () => {
    it('PERF-1 a catalogue search answers within 2 seconds (store results; discovery providers offline)', async () => {
      const started = performance.now();
      const response = await api(ids.base).get('/api/catalogue/books?q=hound');
      const elapsed = performance.now() - started;
      assert.equal(response.status, 200);
      assert.ok(elapsed < 2000, `search took ${Math.round(elapsed)} ms`);
    });

    it('PERF-4 / SCAL 100 simultaneous visitors reading book details are all served correctly and quickly', async () => {
      const started = performance.now();
      const responses = await Promise.all(Array.from({ length: 100 }, () => api(ids.base).get(`/api/books/${ids.pride}`)));
      const elapsed = performance.now() - started;
      assert.ok(responses.every(response => response.status === 200 && response.json.book.title === 'Pride and Prejudice'));
      assert.ok(elapsed < 3000, `100 concurrent book-detail requests took ${Math.round(elapsed)} ms`);
    });

    it('PERF-2 a complete checkout (order + payment) finishes within 3 seconds', async () => {
      const { client } = await customerWith(ids.base, [{ bookId: ids.hound, quantity: 1 }]);
      const started = performance.now();
      const order = (await draft(client)).json.order;
      const paid = await pay(client, order.id);
      const elapsed = performance.now() - started;
      assert.equal(paid.json.attempt.status, 'succeeded');
      assert.ok(elapsed < 3000, `order + payment took ${Math.round(elapsed)} ms`);
    });

    it('SEC errors never expose internals (no stack traces, no raw database error text)', async () => {
      const responses = [
        await api(ids.base).get('/api/orders/%00'),
        await api(ids.base, await sessionFor(ids.asha)).get('/api/orders/99999999999999999999'),
        await api(ids.base).post('/api/auth/login', '{bad json'),
      ];
      for (const response of responses) assert.ok(!/at .*\.js:\d+|ER_[A-Z_]+|sqlMessage|node_modules/.test(response.text), response.text.slice(0, 200));
      assert.equal((await fetch(`${ids.base}/api/health`)).headers.get('x-powered-by'), null, 'the framework is not advertised');
    });
  });

  // ---------------------------------------------------------------- Known defects (todo = documented, not blocking)
  describe('known defects (see docs/TEST_EXECUTION_REPORT.md)', () => {
    it('DEF-01 TC-ORD-03 / BR-2 a customer can cancel an order before it ships', { todo: 'SRS 5.6 / BR-2: no cancellation endpoint or button exists' }, async () => {
      const { client } = await customerWith(ids.base, [{ bookId: ids.pride, quantity: 1 }]);
      const order = (await draft(client)).json.order;
      const cancelled = await client.post(`/api/orders/${order.id}/cancel`, {});
      assert.equal(cancelled.status, 200);
      assert.equal((await client.get(`/api/orders/${order.id}`)).json.order.status, 'cancelled');
    });

    it('DEF-02 TC-ADM-03 / SRS 5.8 an administrator can list customer orders and move them through Processing, Shipped, Delivered', { todo: 'SRS 5.8 / 5.9: there are no administrator order endpoints or screens' }, async () => {
      const admin = api(ids.base, await sessionFor(ids.admin));
      assert.equal((await admin.get('/api/admin/orders')).status, 200);
    });

    it('DEF-03 TC-ADM-02 adding a book whose ISBN already exists is a clear 409, not a 500', { todo: 'POST /api/admin/books answers 500 ER_DUP_ENTRY' }, async () => {
      const admin = api(ids.base, await sessionFor(ids.admin));
      const body = { title: 'Duplicate ISBN', author: 'A', category: 'Classics', description: 'd', price: 10, isbn: '9780141439518' };
      const response = await admin.post('/api/admin/books', body);
      assert.equal(response.status, 409);
      assert.ok(!/ER_DUP_ENTRY/.test(response.text), 'raw database error codes are not shown to clients');
    });

    it('DEF-04 TC-CART-04 changing a cart quantity above the stock explains how many copies are available', { todo: 'PATCH /api/cart/items/:id says "out of stock" while copies are in stock' }, async () => {
      const { client } = await customerWith(ids.base, [{ bookId: ids.emma, quantity: 1 }]);
      const response = await client.patch(`/api/cart/items/${ids.emma}`, { quantity: 50 });
      assert.equal(response.status, 409);
      assert.equal(response.json.error.code, 'INSUFFICIENT_STOCK');
    });

    it('DEF-06 PERF-1 ten simultaneous catalogue searches still answer within 2 seconds while Open Library is down', { todo: 'provider retries are queued one per second, so concurrent searches wait 10-20 s during an outage' }, async () => {
      const started = performance.now();
      await Promise.all(Array.from({ length: 10 }, (_, index) => api(ids.base).get(`/api/catalogue/books?q=${index % 2 ? 'emma' : 'moon'}`)));
      assert.ok(performance.now() - started < 2000);
    });

    it('DEF-05 TC-PAY-03 paying an order that is already paid says so (409 ORDER_NOT_PAYABLE), not "order not found"', { todo: 'POST /api/payments/orders/:id answers 404 for an already-paid order' }, async () => {
      const { client } = await customerWith(ids.base, [{ bookId: ids.hound, quantity: 1 }]);
      const order = (await draft(client)).json.order;
      await pay(client, order.id);
      const again = await pay(client, order.id);
      assert.equal(again.status, 409);
      assert.equal(again.json.error.code, 'ORDER_NOT_PAYABLE');
    });
  });
});
