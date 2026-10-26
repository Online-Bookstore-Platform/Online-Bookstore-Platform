import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createAuthRouter } from '../../src/features/varchas/authentication/auth.routes.js';
import { verifyPassword } from '../../src/features/varchas/authentication/password.js';

async function fixture(t, env = { NODE_ENV: 'development', DEV_PASSWORD_RESET_LINK: 'true' }) {
  const tokens = new Map();
  const sessions = { destroyed: 0 };
  const users = {
    async findResetUserByEmail(email) { return email === 'reader@example.com' ? { id: 8 } : null; },
    async savePasswordReset(userId, tokenHash, validUntil) { tokens.set(tokenHash, { userId, validUntil, used: false }); },
    async consumePasswordReset(tokenHash, passwordHash) {
      const row = tokens.get(tokenHash);
      if (!row || row.used || row.validUntil <= new Date()) return false;
      row.used = true;
      row.passwordHash = passwordHash;
      return true;
    },
  };
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => { request.session = { destroy(callback) { sessions.destroyed += 1; callback(); } }; next(); });
  app.use('/api/auth', createAuthRouter({ authService: {}, requireAuth: (_req, _res, next) => next(), users, env }));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { base: `http://127.0.0.1:${server.address().port}/api/auth`, tokens, sessions };
}

test('password reset uses a generic response and returns a local-only development link', async t => {
  const { base, tokens, sessions } = await fixture(t);
  const existing = await fetch(`${base}/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'reader@example.com' }) });
  const result = await existing.json();
  assert.equal(existing.status, 200);
  assert.match(result.message, /If an account matches/);
  assert.match(result.developmentToken, /^[A-Za-z0-9_-]{40,60}$/);
  const [storedHash, row] = [...tokens.entries()][0];
  assert.equal(storedHash.length, 64);
  assert.notEqual(storedHash, result.developmentToken);
  assert.equal(row.userId, 8);
  assert.ok(row.validUntil > new Date());

  const missing = await fetch(`${base}/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'absent@example.com' }) });
  assert.equal((await missing.json()).message, result.message);
});

test('reset rejects expired or reused tokens and stores only a bcrypt password hash', async t => {
  const { base, tokens, sessions } = await fixture(t);
  const requested = await fetch(`${base}/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'reader@example.com' }) });
  const { developmentToken } = await requested.json();
  const success = await fetch(`${base}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: developmentToken, password: 'fresh-password-123' }) });
  assert.equal(success.status, 204);
  assert.equal(sessions.destroyed, 1);
  const [, row] = [...tokens.entries()][0];
  assert.match(row.passwordHash, /^\$2/);
  assert.equal(await verifyPassword('fresh-password-123', row.passwordHash), true);
  const reused = await fetch(`${base}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: developmentToken, password: 'another-password-123' }) });
  assert.equal(reused.status, 400);

  const expiredToken = 'x'.repeat(43);
  tokens.set(createHash('sha256').update(expiredToken).digest('hex'), { userId: 8, validUntil: new Date(0), used: false });
  const expired = await fetch(`${base}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: expiredToken, password: 'another-password-123' }) });
  assert.equal(expired.status, 400);
});

test('production reset requests never return the token', async t => {
  const { base } = await fixture(t, { NODE_ENV: 'production' });
  const response = await fetch(`${base}/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'reader@example.com' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(await response.json()), ['message']);
});

test('the localhost development reset link is disabled unless explicitly enabled', async t => {
  const { base } = await fixture(t, { NODE_ENV: 'development', DEV_PASSWORD_RESET_LINK: 'false' });
  const response = await fetch(`${base}/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'reader@example.com' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(await response.json()), ['message']);
});
