import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/features/varchas/authentication/password.js';
import { createAuthService } from '../src/features/varchas/authentication/auth.service.js';
import { HttpError } from '../src/features/varchas/errors.js';
import { validateBookInput, validateBookId } from '../src/features/varchas/book-details/book.validation.js';
import { createPaymentService } from '../src/features/varchas/payments/payment.service.js';
import { createPaymentProvider } from '../src/features/varchas/payments/payment.provider.js';
import { createSessionMiddleware } from '../src/features/varchas/index.js';
import { createMySqlSessionStore } from '../src/features/varchas/mysql-session-store.js';

test('authentication verifies a bcrypt hash and returns no password fields', async () => {
  const user = { id: 'u-1', name: 'Reader', email: 'reader@example.com', role: 'customer', passwordHash: await hashPassword('correct-horse') };
  const service = createAuthService({ findByEmail: async email => email === user.email ? user : null, findById: async id => id === user.id ? user : null });
  assert.deepEqual(await service.authenticate(user.email, 'correct-horse'), { id: 'u-1', name: 'Reader', email: user.email, role: 'customer' });
  await assert.rejects(service.authenticate(user.email, 'incorrect-password'), error => error.status === 401);
  await assert.rejects(service.authenticate('missing@example.com', 'incorrect-password'), error => error.status === 401);
  assert.deepEqual(await service.getCurrentUser(user.id), { id: 'u-1', name: 'Reader', email: user.email, role: 'customer' });
});

test('book validation accepts safe edits and rejects bad prices, identifiers, and stock fields', () => {
  const book = { title: 'A Book', author: 'An Author', isbn: '9781234567890', category: 'Fiction', description: 'A story.', price: '199.50', coverImageUrl: '' };
  assert.equal(validateBookInput(book).price, 199.5);
  assert.equal(validateBookInput({ ...book, isbn: '' }).isbn, '');
  assert.equal(validateBookId('book-123'), 'book-123');
  assert.throws(() => validateBookId('../secrets'), error => error.status === 400);
  assert.throws(() => validateBookInput({ price: -1 }, { partial: true }), error => error.status === 400);
  assert.throws(() => validateBookInput({ stockQuantity: 100 }, { partial: true }), error => error.status === 400);
});

function paymentFixture({ outcome = 'succeeded', amount = 750 } = {}) {
  const attempts = new Map();
  let providerCalls = 0;
  let orderLookups = 0;
  let orderStatus = 'pending';
  const orders = {
    async getPayableOrder(id, customerId) { orderLookups += 1; return id === 'o-1' && customerId === 'u-1' ? { id, customerId, amount, currency: 'INR', status: orderStatus } : null; },
    async recordPaymentStatus({ paymentStatus }) { orderStatus = paymentStatus === 'succeeded' ? 'paid' : 'payment_failed'; },
  };
  const payments = {
    async findByIdempotencyKey(key) { return [...attempts.values()].find(item => item.idempotencyKey === key) || null; },
    async findById(id) { return attempts.get(id) || null; },
    async createPending(input) { const item = { id: 'p-1', status: 'pending', ...input }; attempts.set(item.id, item); return item; },
    async updateStatus(id, status, providerReference) { const item = { ...attempts.get(id), status, providerReference }; attempts.set(id, item); return item; },
  };
  const provider = { mode: 'internal', async process() { providerCalls += 1; return { status: outcome, providerReference: 'folio-ref' }; } };
  return { service: createPaymentService({ orders, payments, provider }), attempts, get providerCalls() { return providerCalls; }, get orderLookups() { return orderLookups; } };
}

test('payment processing uses the server amount and reuses an idempotent attempt', async () => {
  const fixture = paymentFixture();
  const first = await fixture.service.process({ orderId: 'o-1', customerId: 'u-1', idempotencyKey: 'key-1' });
  const second = await fixture.service.process({ orderId: 'o-1', customerId: 'u-1', idempotencyKey: 'key-1' });
  assert.equal(first.attempt.amount, 750);
  assert.equal(first.attempt.status, 'succeeded');
  assert.equal(second.reused, true);
  assert.equal(fixture.providerCalls, 1);
  assert.equal(fixture.orderLookups, 1, 'a retry returns the prior result even after the order is marked paid');
});

test('a declined checkout can start a fresh attempt after the order remains unpaid', async () => {
  const fixture = paymentFixture({ outcome: 'failed' });
  const first = await fixture.service.process({ orderId: 'o-1', customerId: 'u-1', idempotencyKey: 'key-failed' });
  const retried = await fixture.service.process({ orderId: 'o-1', customerId: 'u-1', idempotencyKey: 'key-retry' });
  assert.equal(first.attempt.status, 'failed');
  assert.equal(retried.attempt.status, 'failed');
  assert.equal(fixture.providerCalls, 2);
});

test('a pending payment attempt can be cancelled by its owner', async () => {
  const fixture = paymentFixture({ outcome: 'pending' });
  const processed = await fixture.service.process({ orderId: 'o-1', customerId: 'u-1', idempotencyKey: 'key-1' });
  assert.equal(processed.attempt.status, 'pending');
  const cancelled = await fixture.service.cancel(processed.attempt.id, 'u-1');
  assert.equal(cancelled.status, 'cancelled');
});

test('payment attempts reject missing ownership and invalid order amounts before provider use', async () => {
  const fixture = paymentFixture({ amount: 0 });
  await assert.rejects(fixture.service.process({ orderId: 'o-1', customerId: 'u-1', idempotencyKey: 'key-1' }), error => error instanceof HttpError && error.code === 'INVALID_ORDER_AMOUNT');
  await assert.rejects(fixture.service.process({ orderId: 'o-1', customerId: 'u-2', idempotencyKey: 'key-2' }), error => error.status === 404);
  assert.equal(fixture.providerCalls, 0);
});

test('internal checkout creates only local outcomes and supports retry-result scenarios', async () => {
  assert.equal(createPaymentProvider({}).mode, 'internal');
  assert.equal((await createPaymentProvider({ FOLIO_CHECKOUT_OUTCOME: 'approved' }).process({ paymentId: 'p-1' })).status, 'succeeded');
  for (const [configured, expected] of Object.entries({ declined: 'failed', cancelled: 'cancelled', timeout: 'timed_out' })) {
    const provider = createPaymentProvider({ FOLIO_CHECKOUT_OUTCOME: configured });
    if (configured === 'timeout') await assert.rejects(provider.process({ paymentId: 'p-2' }), error => error.code === 'PAYMENT_TIMEOUT');
    else assert.equal((await provider.process({ paymentId: 'p-2' })).status, expected);
  }
  assert.throws(() => createPaymentProvider({ FOLIO_CHECKOUT_OUTCOME: 'unknown' }), /must be approved/);
});

test('production sessions require an explicit secret and persistent store', () => {
  assert.throws(() => createSessionMiddleware({ production: true }), /persistent session store/);
  assert.doesNotThrow(() => createSessionMiddleware({ production: true, secret: 'configured-secret', store: new session.MemoryStore() }));
});

test('MySQL session store writes, reads, touches, expires, and destroys sessions', async () => {
  const records = new Map();
  const pool = {
    async query(sql, params) {
      if (sql.startsWith('INSERT INTO sessions')) {
        records.set(params[0], { session_id: params[0], expires: params[1], data: params[2] });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT data, expires FROM sessions')) return [[records.get(params[0])].filter(Boolean)];
      if (sql.startsWith('UPDATE sessions SET expires')) {
        const row = records.get(params[1]);
        if (row) row.expires = params[0];
        return [{ affectedRows: row ? 1 : 0 }];
      }
      if (sql.startsWith('DELETE FROM sessions')) {
        const existed = records.delete(params[0]);
        return [{ affectedRows: existed ? 1 : 0 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const store = createMySqlSessionStore(pool);
  const invoke = (method, ...args) => new Promise((resolve, reject) => store[method](...args, (error, result) => error ? reject(error) : resolve(result)));
  const sessionData = { userId: 8, cookie: { expires: new Date(Date.now() + 60_000), maxAge: 60_000 } };

  await invoke('set', 'sid-1', sessionData);
  assert.equal(JSON.parse(records.get('sid-1').data).userId, 8);
  assert.deepEqual(await invoke('get', 'sid-1'), JSON.parse(JSON.stringify(sessionData)));
  await invoke('touch', 'sid-1', { ...sessionData, cookie: { ...sessionData.cookie, expires: new Date(Date.now() + 120_000) } });
  assert.ok(records.get('sid-1').expires > Math.floor(Date.now() / 1000) + 60);

  records.set('expired', { session_id: 'expired', expires: 1, data: JSON.stringify(sessionData) });
  assert.equal(await invoke('get', 'expired'), null);
  assert.equal(records.has('expired'), false);
  await invoke('destroy', 'sid-1');
  assert.equal(records.has('sid-1'), false);
});

test('admin book endpoints require a server-verified administrator role', async t => {
  const passwordHash = await hashPassword('correct-horse');
  const users = [
    { id: 'u-customer', name: 'Reader', email: 'reader@example.com', role: 'customer', passwordHash },
    { id: 'u-admin', name: 'Editor', email: 'admin@example.com', role: 'admin', passwordHash },
  ];
  const app = createApp({
    sessionSecret: 'test-session-secret-that-is-long-enough',
    env: { NODE_ENV: 'test' },
    repositories: {
      users: { findByEmail: async email => users.find(user => user.email === email), findById: async id => users.find(user => user.id === id) },
      books: { findById: async () => null, list: async () => [], create: async book => book, update: async () => null, deleteOrDeactivate: async () => false },
      orders: { getPayableOrder: async () => null, recordPaymentStatus: async () => {} },
      payments: { findByIdempotencyKey: async () => null, findById: async () => null, createPending: async input => ({ id: 'p-1', ...input }), updateStatus: async () => null },
    },
  });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const anonymous = await fetch(`${base}/api/admin/books`);
  assert.equal(anonymous.status, 401);

  const customerLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'reader@example.com', password: 'correct-horse' }) });
  assert.equal(customerLogin.status, 200);
  const customerCookie = customerLogin.headers.get('set-cookie').split(';', 1)[0];
  const customerAccess = await fetch(`${base}/api/admin/books`, { headers: { Cookie: customerCookie } });
  assert.equal(customerAccess.status, 403);
  for (const [method, path, body] of [
    ['POST', '/api/admin/books', {}],
    ['PATCH', '/api/admin/books/1', { price: 1 }],
    ['DELETE', '/api/admin/books/1', undefined],
  ]) {
    const response = await fetch(`${base}${path}`, { method, headers: { Cookie: customerCookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 403, `customer ${method} ${path} must be forbidden`);
  }
  const currentUser = await fetch(`${base}/api/auth/me`, { headers: { Cookie: customerCookie } });
  assert.deepEqual((await currentUser.json()).user, { id: 'u-customer', name: 'Reader', email: 'reader@example.com', role: 'customer' });
  const logoutResponse = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: customerCookie } });
  assert.equal(logoutResponse.status, 204);
  const afterLogout = await fetch(`${base}/api/auth/me`, { headers: { Cookie: customerCookie } });
  assert.equal(afterLogout.status, 401);

  const adminLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'correct-horse' }) });
  const adminCookie = adminLogin.headers.get('set-cookie').split(';', 1)[0];
  const adminAccess = await fetch(`${base}/api/admin/books`, { headers: { Cookie: adminCookie } });
  assert.equal(adminAccess.status, 200);
  assert.deepEqual(await adminAccess.json(), { books: [] });
});

test('registered customer can sign in through the mounted session flow', async t => {
  const users = new Map();
  let nextId = 1;
  const pool = {
    async query(sql, params) {
      if (sql.startsWith('INSERT INTO users')) {
        const user = { id: nextId++, name: params[0], email: params[1], phone: params[2], role: 'customer', passwordHash: params[3] };
        users.set(user.email, user);
        return [{ insertId: user.id }];
      }
      if (sql.startsWith('SELECT id, name, email, phone, role FROM users')) {
        const user = [...users.values()].find(candidate => candidate.id === params[0]);
        return [[user ? { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } : undefined].filter(Boolean)];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const app = createApp({
    pool,
    sessionSecret: 'test-session-secret-that-is-long-enough',
    env: { NODE_ENV: 'test' },
    repositories: {
      users: {
        async findByEmail(email) { return users.get(email) || null; },
        async findById(id) { return [...users.values()].find(user => user.id === id) || null; },
      },
    },
  });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const invalidLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: 'too-short' }),
  });
  assert.equal(invalidLogin.status, 400);
  const missingUserLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'missing@example.com', password: 'reading-password' }),
  });
  assert.equal(missingUserLogin.status, 401);

  const registration = await fetch(`${base}/api/users/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Reader One', email: 'reader@example.com', phone: '', password: 'reading-password', confirmPassword: 'reading-password', acceptedTerms: true }),
  });
  assert.equal(registration.status, 201);
  assert.equal((await registration.json()).user.passwordHash, undefined);
  assert.match(users.get('reader@example.com').passwordHash, /^\$2/);

  const wrongPassword = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'reader@example.com', password: 'wrong-password' }),
  });
  assert.equal(wrongPassword.status, 401);

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'reader@example.com', password: 'reading-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  const sessionCookie = cookie.split(';', 1)[0];
  const current = await fetch(`${base}/api/auth/me`, { headers: { Cookie: sessionCookie } });
  assert.deepEqual((await current.json()).user, { id: 1, name: 'Reader One', email: 'reader@example.com', role: 'customer' });

  const profile = await fetch(`${base}/api/profile`, { headers: { Cookie: sessionCookie } });
  assert.equal(profile.status, 200);
  assert.deepEqual((await profile.json()).user, { id: 1, name: 'Reader One', email: 'reader@example.com', phone: null, role: 'customer' });

  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: sessionCookie } });
  assert.equal(logout.status, 204);
  const protectedProfile = await fetch(`${base}/api/profile`, { headers: { Cookie: sessionCookie } });
  assert.equal(protectedProfile.status, 401);
});
