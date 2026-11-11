import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createContactRouter } from '../src/features/contact/contact.routes.js';
import { createTestDatabase, databaseTests } from './uditi/helpers.js';

async function withServer(pool, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/contact', createContactRouter({ pool }));
  const server = app.listen(0);
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('contact form validates and persists a submission before reporting success', async () => {
  const inserts = [];
  const pool = { async query(sql, values) { inserts.push({ sql, values }); return [{ insertId: 9 }]; } };
  await withServer(pool, async origin => {
    const invalid = await fetch(`${origin}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'A', email: 'bad', subject: '', message: '' }) });
    assert.equal(invalid.status, 400);
    assert.equal(inserts.length, 0);
    const response = await fetch(`${origin}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'A Reader', email: 'READER@example.com', subject: 'A question', message: 'Could you help me find a title?' }) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).success, true);
    assert.deepEqual(inserts[0].values, ['A Reader', 'reader@example.com', 'A question', 'Could you help me find a title?']);
    assert.match(inserts[0].sql, /INSERT INTO contact_submissions/);
  });
});

test('contact form does not report success when persistence is unavailable', async () => {
  await withServer(null, async origin => {
    const response = await fetch(`${origin}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'A Reader', email: 'reader@example.com', subject: 'A question', message: 'Could you help me find a title?' }) });
    assert.equal(response.status, 503);
  });
});

test('MySQL contact form stores the submission returned as successful', databaseTests, async t => {
  const testDb = await createTestDatabase();
  t.after(() => testDb.drop());
  await withServer(testDb.pool, async origin => {
    const response = await fetch(`${origin}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Database Reader', email: 'reader@example.invalid', subject: 'Catalog question', message: 'Could you help me find this book?' }) });
    assert.equal(response.status, 201);
    const [rows] = await testDb.pool.query('SELECT name, email, subject, message FROM contact_submissions WHERE email = ?', ['reader@example.invalid']);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { name: 'Database Reader', email: 'reader@example.invalid', subject: 'Catalog question', message: 'Could you help me find this book?' });
  });
});
