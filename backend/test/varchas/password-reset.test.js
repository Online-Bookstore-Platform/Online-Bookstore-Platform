import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createAuthRouter } from '../../src/features/varchas/authentication/auth.routes.js';
import { verifyPassword } from '../../src/features/varchas/authentication/password.js';

async function fixture(t, mailConfigured = true) {
  const env = { NODE_ENV: 'test', SESSION_SECRET: 'unit-test-reset-pepper' };
  const state = { reset: null, sessions: 0, passwordHash: null, sent: [] };
  const users = {
    async findResetUserByEmail(email) { return email === 'reader@example.com' ? { id: 8 } : null; },
    async savePasswordReset(userId, tokenHash, validUntil) { state.reset = { userId, tokenHash, validUntil, attempts: 0, used: false }; return true; },
    async verifyPasswordResetOtp(email, tokenHash, proofHash, validUntil) {
      const row = state.reset;
      if (!row || email !== 'reader@example.com' || row.used || row.validUntil <= new Date() || row.attempts >= 5) return false;
      if (row.tokenHash !== tokenHash) { row.attempts += 1; return false; }
      row.tokenHash = proofHash; row.validUntil = validUntil; return true;
    },
    async consumePasswordReset(tokenHash, passwordHash) {
      const row = state.reset;
      if (!row || row.used || row.validUntil <= new Date() || row.tokenHash !== tokenHash) return false;
      row.used = true; state.passwordHash = passwordHash; return true;
    },
  };
  const emailService = mailConfigured ? { configured: true, async sendPasswordResetOtp(message) { state.sent.push(message); } } : null;
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { request.session = { destroy(callback) { state.sessions += 1; callback(); } }; next(); });
  app.use('/api/auth', createAuthRouter({ authService: {}, requireAuth: (_req, _res, next) => next(), users, emailService, env }));
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ error: { code: error.code, message: error.message } }));
  const server = app.listen(0); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { base: `http://127.0.0.1:${server.address().port}/api/auth`, state, env };
}

const post = (base, path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('reset sends a six-digit OTP, stores only a hash, and keeps account responses generic', async t => {
  const { base, state } = await fixture(t);
  const known = await post(base, '/forgot-password', { email: 'reader@example.com' });
  assert.match((await known.json()).message, /If an account matches/);
  assert.match(state.sent[0].otp, /^\d{6}$/);
  assert.equal(state.reset.tokenHash.length, 64);
  assert.notEqual(state.reset.tokenHash, state.sent[0].otp);
  assert.ok(state.reset.validUntil - new Date() <= 5 * 60 * 1000);
  const missing = await post(base, '/forgot-password', { email: 'absent@example.com' });
  assert.deepEqual(await missing.json(), { message: 'If an account matches, a reset code may be delivered to its registered email address.' });
});

test('OTP is verified once and password reset hashes the password and invalidates sessions', async t => {
  const { base, state, env } = await fixture(t);
  await post(base, '/forgot-password', { email: 'reader@example.com' });
  const otp = state.sent[0].otp;
  const invalid = await post(base, '/verify-reset-otp', { email: 'reader@example.com', otp: '000000' });
  assert.equal(invalid.status, 400);
  const verified = await post(base, '/verify-reset-otp', { email: 'reader@example.com', otp });
  const { resetToken } = await verified.json();
  assert.equal(verified.status, 200);
  const success = await post(base, '/reset-password', { resetToken, password: 'fresh-password-123' });
  assert.equal(success.status, 204);
  assert.equal(state.sessions, 1);
  assert.match(state.passwordHash, /^\$2/);
  assert.equal(await verifyPassword('fresh-password-123', state.passwordHash), true);
  assert.equal((await post(base, '/verify-reset-otp', { email: 'reader@example.com', otp })).status, 400);
  assert.equal((await post(base, '/reset-password', { resetToken, password: 'another-password-123' })).status, 400);
});

test('forgot-password never exposes codes and returns the same response for unknown addresses', async t => {
  const { base, state } = await fixture(t, false);
  const known = await post(base, '/forgot-password', { email: 'reader@example.com' });
  const unknown = await post(base, '/forgot-password', { email: 'absent@example.com' });
  assert.equal(known.status, 503); assert.equal(unknown.status, 503);
  assert.equal((await known.json()).error.code, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  assert.equal((await unknown.json()).error.code, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  assert.equal(state.sent.length, 0);
});
