import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createVrindaRouter } from '../../src/features/vrinda/index.js';

async function sendRequest(router, path, { method = 'GET', body } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('Vrinda routes fail closed when database or authentication dependencies are missing', async () => {
  const noDatabase = await sendRequest(createVrindaRouter(), '/api/cart');
  assert.equal(noDatabase.status, 503);
  assert.equal(noDatabase.body.error.code, 'DEPENDENCY_NOT_CONFIGURED');

  const noAuth = await sendRequest(createVrindaRouter({ pool: {} }), '/api/profile');
  assert.equal(noAuth.status, 503);
  assert.equal(noAuth.body.error.code, 'DEPENDENCY_NOT_CONFIGURED');
});

test('registration stores only a password hash and profile queries run after authentication', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('INSERT INTO users')) return [{ insertId: 31 }];
      if (sql.startsWith('SELECT id, name, email, phone, role')) {
        return [[{ id: 31, name: 'Vrinda Venugopal', email: 'vrinda@example.com', phone: null, role: 'customer' }]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const requireAuth = (request, _response, next) => {
    request.user = { id: 31, role: 'customer' };
    next();
  };
  const router = createVrindaRouter({ pool, requireAuth });

  const registered = await sendRequest(router, '/api/users/register', {
    method: 'POST',
    body: {
      name: 'Vrinda Venugopal',
      email: 'vrinda@example.com',
      password: 'reading-password',
      confirmPassword: 'reading-password',
      acceptedTerms: true,
    },
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.id, 31);
  assert.equal(registered.body.user.passwordHash, undefined);
  const insert = calls.find(call => call.sql.startsWith('INSERT INTO users'));
  assert.notEqual(insert.params[3], 'reading-password');
  assert.ok(insert.params[3].startsWith('$2'));

  const profile = await sendRequest(router, '/api/profile');
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.email, 'vrinda@example.com');
  assert.deepEqual(calls.at(-1).params, [31]);
});

test('protected cart requests stop at Varchas authentication middleware', async () => {
  let queried = false;
  const router = createVrindaRouter({
    pool: { async query() { queried = true; return [[]]; } },
    requireAuth: (_request, response) => response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } }),
  });

  const result = await sendRequest(router, '/api/cart');

  assert.equal(result.status, 401);
  assert.equal(queried, false);
});
