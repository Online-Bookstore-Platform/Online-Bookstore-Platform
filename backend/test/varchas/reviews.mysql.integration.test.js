import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createReviewsRouter } from '../../src/features/varchas/book-details/reviews.routes.js';
import { clearDemoReviews } from '../../src/features/varchas/book-details/demo-reviews.js';
import { createTestDatabase, databaseTests } from '../uditi/helpers.js';

test('MySQL review flow persists local customer and demo reviews and enforces ownership', databaseTests, async t => {
  const testDb = await createTestDatabase();
  t.after(() => testDb.drop());
  const pool = testDb.pool;
  const [category] = await pool.query('INSERT INTO categories (name) VALUES (?)', ['Review Integration']);
  const [product] = await pool.query(`INSERT INTO books (title, author, category_id, price)
    VALUES ('Integration Book', 'Test Author', ?, 120)`, [category.insertId]);
  const bookId = String(product.insertId);
  const makeUser = async email => {
    const [result] = await pool.query(`INSERT INTO users (name, email, password_hash, role, terms_accepted_at)
      VALUES (?, ?, 'not-used-by-this-test', 'customer', UTC_TIMESTAMP())`, [email, email]);
    return String(result.insertId);
  };
  const ownerName = `review-owner-${Date.now()}@example.invalid`;
  const ownerId = await makeUser(ownerName);
  const otherId = await makeUser(`review-other-${Date.now()}@example.invalid`);

  const app = express();
  app.use(express.json());
  app.use('/api/books', createReviewsRouter({
    pool,
    env: { NODE_ENV: 'development' },
    requireAuth: (request, _response, next) => {
      request.user = { id: request.get('x-test-user') || ownerId };
      request.session = { userId: request.user.id };
      next();
    },
  }));
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ error: error.code || 'TEST_ERROR' }));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/books/${bookId}/reviews`;

  const submitted = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 5, content: 'A real database-backed customer review.', username: 'Impersonated Name', reviewerId: otherId }) });
  assert.equal(submitted.status, 201);
  const review = (await submitted.json()).review;

  const duplicate = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 4, content: 'An updated database-backed review.' }) });
  assert.equal(duplicate.status, 201);
  const [reviewRows] = await pool.query('SELECT id, rating, user_id FROM book_reviews WHERE book_id = ? AND is_demo = 0', [`local:${bookId}`]);
  assert.equal(reviewRows.length, 1);
  assert.equal(String(reviewRows[0].user_id), ownerId);

  // A different authenticated customer reads the same shared MySQL review and cannot
  // influence the stored reviewer identity with fields supplied in the request body.
  const otherList = await fetch(base, { headers: { 'x-test-user': otherId } });
  const otherPayload = await otherList.json();
  const sharedReview = otherPayload.reviews.find(item => String(item.id) === String(review.id));
  assert.ok(sharedReview);
  assert.equal(sharedReview.author, ownerName);
  assert.equal(sharedReview.mine, false);

  const listed = await fetch(base);
  const payload = await listed.json();
  assert.equal(payload.summary.count, 1);
  assert.ok(payload.summary.average === 4); // duplicate submission updates the customer's single review.
  assert.ok(payload.summary.demoCount >= 8 && payload.summary.demoCount <= 12);
  assert.ok(payload.summary.demoAverage >= 1 && payload.summary.demoAverage <= 5);
  assert.ok(payload.reviews.every(item => !item.isDemo || /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(item.author)));
  await fetch(base);
  const [demoRows] = await pool.query('SELECT COUNT(*) AS count FROM book_reviews WHERE book_id = ? AND is_demo = 1', [`local:${bookId}`]);
  assert.equal(Number(demoRows[0].count), payload.summary.demoCount);
  const workResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/books/works%2FOL25796244W/reviews`);
  const workCount = (await workResponse.json()).summary.demoCount;
  assert.ok(workCount >= 8 && workCount <= 12);
  await fetch(`http://127.0.0.1:${server.address().port}/api/books/works%2FOL25796244W/reviews`);
  const [workRows] = await pool.query("SELECT COUNT(*) AS count FROM book_reviews WHERE book_id = 'works/OL25796244W' AND is_demo = 1");
  assert.equal(Number(workRows[0].count), workCount);

  const denied = await fetch(`${base}/${review.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-test-user': otherId }, body: JSON.stringify({ rating: 4, content: 'An update from another account.' }) });
  assert.equal(denied.status, 404);
  assert.equal(await clearDemoReviews(pool), payload.summary.demoCount + workCount);
  const [genuine] = await pool.query('SELECT COUNT(*) AS count FROM book_reviews WHERE is_demo = 0');
  assert.equal(Number(genuine[0].count), 1);
});
