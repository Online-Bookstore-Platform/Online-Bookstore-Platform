import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { createDatabasePool } from '../../src/config/database.js';
import { hashPassword } from '../../src/features/varchas/authentication/password.js';
import { createMySqlSessionStore } from '../../src/features/varchas/mysql-session-store.js';

const hasDatabaseConfig = Boolean(process.env.DB_NAME && process.env.DB_USER);

test('MySQL-backed login persists sessions and logout removes them', { skip: !hasDatabaseConfig && 'Set DB_NAME and DB_USER to run the MySQL session integration test.' }, async t => {
  const pool = createDatabasePool();
  let userId;
  let server;
  const sessionIds = new Set();
  t.after(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    if (sessionIds.size) await pool.query('DELETE FROM sessions WHERE session_id IN (?)', [[...sessionIds]]);
    if (userId) await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    await pool.end();
  });

  const email = `session-store-${randomUUID()}@example.invalid`;
  const password = 'mysql-session-integration-password';
  const passwordHash = await hashPassword(password);
  const [inserted] = await pool.query(
    `INSERT INTO users (name, email, password_hash, phone, role, terms_accepted_at)
     VALUES (?, ?, ?, NULL, 'customer', UTC_TIMESTAMP())`,
    ['Session Store Integration', email, passwordHash]
  );
  userId = inserted.insertId;

  const users = {
    async findByEmail(address) {
      const [rows] = await pool.query('SELECT id, name, email, role, password_hash AS passwordHash FROM users WHERE email = ? LIMIT 1', [address]);
      return rows[0] ?? null;
    },
    async findById(id) {
      const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1', [id]);
      return rows[0] ?? null;
    },
  };
  const app = createApp({
    repositories: { users },
    pool,
    sessionStore: createMySqlSessionStore(pool),
    sessionSecret: 'mysql-session-integration-secret-long-enough',
    env: { NODE_ENV: 'test' },
  });
  server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const anonymous = await fetch(`${base}/api/auth/me`);
  assert.equal(anonymous.status, 401);

  async function login(cookie) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i);
    const cookieHeader = setCookie.split(';', 1)[0];
    const signedSessionId = decodeURIComponent(cookieHeader.slice('folio.sid='.length));
    const sessionId = signedSessionId.slice(2, signedSessionId.lastIndexOf('.'));
    sessionIds.add(sessionId);
    return { cookieHeader, sessionId };
  }

  const firstLogin = await login();
  const [firstRows] = await pool.query('SELECT expires, data FROM sessions WHERE session_id = ?', [firstLogin.sessionId]);
  assert.equal(firstRows.length, 1, 'login must persist the session before responding');
  assert.ok(Number(firstRows[0].expires) > Math.floor(Date.now() / 1000));
  assert.equal(JSON.parse(firstRows[0].data).userId, userId);

  const current = await fetch(`${base}/api/auth/me`, { headers: { Cookie: firstLogin.cookieHeader } });
  assert.equal(current.status, 200);
  assert.deepEqual((await current.json()).user, { id: userId, name: 'Session Store Integration', email, role: 'customer' });
  const adminAccess = await fetch(`${base}/api/admin/books`, { headers: { Cookie: firstLogin.cookieHeader } });
  assert.equal(adminAccess.status, 403);

  const secondLogin = await login(firstLogin.cookieHeader);
  assert.notEqual(secondLogin.sessionId, firstLogin.sessionId, 'login regenerates the session id');
  const [oldRows] = await pool.query('SELECT session_id FROM sessions WHERE session_id = ?', [firstLogin.sessionId]);
  const [newRows] = await pool.query('SELECT session_id FROM sessions WHERE session_id = ?', [secondLogin.sessionId]);
  assert.equal(oldRows.length, 0, 'regeneration destroys the old persisted session');
  assert.equal(newRows.length, 1, 'regeneration persists the new session');

  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: secondLogin.cookieHeader } });
  assert.equal(logout.status, 204);
  const [afterLogout] = await pool.query('SELECT session_id FROM sessions WHERE session_id = ?', [secondLogin.sessionId]);
  assert.equal(afterLogout.length, 0, 'logout deletes the persisted session');
  const denied = await fetch(`${base}/api/auth/me`, { headers: { Cookie: secondLogin.cookieHeader } });
  assert.equal(denied.status, 401);
});
