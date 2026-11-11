import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/features/varchas/authentication/password.js';
import { createAuthService } from '../src/features/varchas/authentication/auth.service.js';
import { validateBookInput, validateBookId } from '../src/features/varchas/book-details/book.validation.js';
import { createPaymentService } from '../src/features/varchas/payments/payment.service.js';
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

function paymentOtpFixture({ configured = true, sendError, logs = [] } = {}) {
  const saved = new Map();
  const mailed = [];
  const challenges = {
    async create(input) { saved.set(input.id, { ...input, attempts: 0, used: false }); return { id: input.id, resendAt: new Date(Date.now() + 60_000) }; },
    async invalidate(id) { saved.get(id).used = true; },
    async verify({ id, userId, otpHash }) {
      const row = saved.get(id);
      if (!row || row.userId !== userId) return { ok: false, reason: 'invalid' };
      if (row.used) return { ok: false, reason: 'used' };
      if (row.otpHash !== otpHash) { row.attempts += 1; return { ok: false, reason: row.attempts >= 5 ? 'attempts_exceeded' : 'incorrect' }; }
      row.used = true;
      return { ok: true, paymentMethod: row.paymentMethod };
    },
  };
  const orders = {
    async validatePaymentCheckout() { return { totalAmount: 42, itemCount: 1 }; },
    async createAfterPaymentOtp({ userId, challengeId, verifyChallenge }) {
      const verification = await verifyChallenge(null);
      return verification.ok ? { order: { id: 7, userId, paymentMethod: verification.paymentMethod, paymentStatus: 'succeeded' }, reused: false } : { verification };
    },
  };
  const payments = { async recordSimulatedSuccess() {} };
  const emailService = { configured, async sendPaymentOtp(message) { mailed.push(message); if (sendError) throw sendError; } };
  const logger = { error(...args) { logs.push(args); } };
  return { service: createPaymentService({ orders, payments, otpChallenges: challenges, emailService, secret: 'test-pepper', logger }), saved, mailed, logs };
}

test('simulated payment sends a private Gmail OTP and creates a confirmed order only after verification', async () => {
  const fixture = paymentOtpFixture();
  const challenge = await fixture.service.requestOtp({ user: { id: 4, email: 'reader@example.com' }, paymentMethod: 'upi' });
  assert.equal(fixture.mailed[0].to, 'reader@example.com');
  assert.equal(fixture.mailed[0].otp.length, 6);
  assert.equal(Object.hasOwn(challenge, 'otp'), false, 'the endpoint result has no code');
  assert.notEqual(fixture.saved.get(challenge.challengeId).otpHash, fixture.mailed[0].otp, 'database state stores only the HMAC hash');
  const result = await fixture.service.verifyOtp({ userId: 4, challengeId: challenge.challengeId, otp: fixture.mailed[0].otp });
  assert.equal(result.order.paymentStatus, 'succeeded');
  assert.equal(result.order.paymentMethod, 'upi');
});

test('incorrect codes consume attempts and the fifth failed attempt locks the challenge', async () => {
  const fixture = paymentOtpFixture();
  const challenge = await fixture.service.requestOtp({ user: { id: 4, email: 'reader@example.com' }, paymentMethod: 'card' });
  for (let attempt = 0; attempt < 4; attempt += 1) await assert.rejects(fixture.service.verifyOtp({ userId: 4, challengeId: challenge.challengeId, otp: '000000' }), error => error.code === 'PAYMENT_OTP_INCORRECT');
  await assert.rejects(fixture.service.verifyOtp({ userId: 4, challengeId: challenge.challengeId, otp: '000000' }), error => error.code === 'PAYMENT_OTP_ATTEMPTS_EXCEEDED');
});

test('payment OTP fails closed without Gmail and keeps method selection within supported options', async () => {
  const fixture = paymentOtpFixture({ configured: false });
  await assert.rejects(fixture.service.requestOtp({ user: { id: 4, email: 'reader@example.com' }, paymentMethod: 'upi' }), error => error.code === 'PAYMENT_OTP_UNAVAILABLE');
  await assert.rejects(fixture.service.requestOtp({ user: { id: 4, email: 'reader@example.com' }, paymentMethod: 'cod' }), error => error.code === 'INVALID_PAYMENT_METHOD');
});

test('SMTP failure logs safe diagnostics, invalidates challenge and keeps response generic', async () => {
  const fixture = paymentOtpFixture({ sendError: Object.assign(new Error('private detail'), { code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535, response: '535 Authentication failed' }) });
  await assert.rejects(fixture.service.requestOtp({ user: { id: 4, email: 'reader@example.com' }, paymentMethod: 'upi' }), error => {
    assert.equal(error.code, 'PAYMENT_OTP_DELIVERY_FAILED');
    assert.equal(error.message, 'We could not deliver the payment code. Check the email setup and try again.');
    return true;
  });
  const diagnostic = JSON.stringify(fixture.logs);
  assert.match(diagnostic, /EAUTH/);
  assert.match(diagnostic, /535/);
  assert.doesNotMatch(diagnostic, /private detail|283940|secret|password/i);
  assert.equal([...fixture.saved.values()][0].used, true);
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
