import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createReviewsRouter } from '../../src/features/varchas/book-details/reviews.routes.js';

async function withServer(pool, env, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/books', createReviewsRouter({
    pool,
    env,
    ensureDemos: async () => {},
    requireAuth: (request, _response, next) => { request.user = { id: 7 }; next(); },
  }));
  const server = app.listen(0);
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('reviews support numeric local book IDs and bind the authenticated reviewer', async () => {
  const queries = [];
  const pool = { async query(sql, values = []) {
    queries.push({ sql, values });
    if (sql.includes('SELECT id FROM books')) return [[{ id: 11 }]];
    if (sql.includes('INSERT INTO book_reviews')) return [{ affectedRows: 1 }];
    if (sql.includes('FROM book_reviews r JOIN users')) return [[{ id: 4, rating: 5, content: 'A quietly memorable read.', author: 'Reader' }]];
    if (sql.includes('LEFT JOIN users')) return [[{ id: 4, rating: 5, content: 'A quietly memorable read.', author: 'Reader', isDemo: 0, mine: 1 }]];
    if (sql.includes('AND r.is_demo = 0')) return [[{ count: 1, average: 5 }]];
    if (sql.includes('is_demo = 1')) return [[{ count: 0, average: null }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };

  await withServer(pool, { NODE_ENV: 'development' }, async origin => {
    const response = await fetch(`${origin}/api/books/11/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 5, content: 'A quietly memorable read.' }) });
    assert.equal(response.status, 201);
    const insert = queries.find(query => query.sql.includes('INSERT INTO book_reviews'));
    assert.deepEqual(insert.values, ['local:11', '11', 7, 5, 'A quietly memorable read.']);
    const list = await fetch(`${origin}/api/books/11/reviews`);
    assert.equal((await list.json()).summary.count, 1);

    const invalid = await fetch(`${origin}/api/books/11/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 6, content: 'short' }) });
    assert.equal(invalid.status, 400);
  });
});

test('production review reads explicitly exclude demo rows and summaries', async () => {
  const queries = [];
  const pool = { async query(sql) {
    queries.push(sql);
    if (sql.includes('LEFT JOIN users')) return [[]];
    if (sql.includes('AND r.is_demo = 0')) return [[{ count: 0, average: null }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  await withServer(pool, { NODE_ENV: 'production' }, async origin => {
    const response = await fetch(`${origin}/api/books/works%2FOL123W/reviews`);
    assert.equal(response.status, 200);
    assert.ok(queries.some(sql => sql.includes('AND r.is_demo = 0')));
    assert.ok(queries.every(sql => !sql.includes('is_demo = 1')));
  });
});
