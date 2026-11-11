import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createOpenLibraryCatalogueRouter } from '../../src/features/uditi/catalogue/open-library.js';
import { createFixtures, createTestDatabase, databaseTests } from './helpers.js';

test('catalogue ratings use persisted customer reviews across all categories and exclude editorial samples', databaseTests, async t => {
  const testDb = await createTestDatabase();
  t.after(() => testDb.drop());
  const db = testDb.pool;
  const fixtures = await createFixtures(db);
  let providersOffline = false;
  const categoryNames = ['Fiction', 'Fantasy', 'Science Fiction', 'Mystery', 'Romance', 'History', 'Biography', 'Philosophy', 'Poetry', "Children's Books", 'Computing', 'Science', 'Psychology', 'Business', 'Travel', 'Adventure', 'Classics', 'Anime & Manga'];
  const reviewer = await fixtures.addUser();
  const products = [];
  for (const [index, categoryName] of categoryNames.entries()) {
    const categoryId = await fixtures.addCategory(`Ratings ${categoryName}`);
    const bookId = await fixtures.addBook({ title: `Ratings ${categoryName} book`, author: 'Test Author', category_id: categoryId, quantity: 2 });
    const rating = index % 5 + 1;
    await db.query(`INSERT INTO book_reviews (book_id, local_book_id, user_id, rating, content)
      VALUES (?, ?, ?, ?, 'A real customer review.')`, [`local:${bookId}`, bookId, reviewer, rating]);
    products.push({ bookId, categoryName: `Ratings ${categoryName}`, rating });
    if (index === 0) await db.query(`INSERT INTO book_reviews (book_id, local_book_id, is_demo, demo_key, demo_label, rating, content)
      VALUES (?, ?, 1, ?, 'Editorial sample', 1, 'An editorial review sample.')`, [`local:${bookId}`, bookId, `local:${bookId}:sample`]);
  }

  const app = express();
  app.use('/api/catalogue', createOpenLibraryCatalogueRouter({ pool: db, fetchImpl: async () => {
    if (providersOffline) throw new Error('Provider unavailable for local fallback coverage.');
    return Response.json({ numFound: 0, docs: [] });
  }, env: { NODE_ENV: 'test' } }));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/catalogue/books?q=Ratings&pageSize=50`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.books.length, categoryNames.length);
  for (const product of products) {
    const book = payload.books.find(item => item.title === `Ratings ${product.categoryName.slice('Ratings '.length)} book`);
    assert.ok(book, `${product.categoryName} book is present`);
    assert.equal(book.category, product.categoryName);
    assert.deepEqual(book.rating, { count: 1, average: product.rating });
  }
  assert.equal(payload.books[0].rating.count, 1, 'the editorial sample is not included in the customer rating');
  providersOffline = true;
  const fallbackResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/catalogue/books?pageSize=50`);
  assert.equal(fallbackResponse.status, 200);
  const fallback = await fallbackResponse.json();
  const fallbackBook = fallback.books.find(book => book.title === 'Ratings Fiction book');
  assert.deepEqual(fallbackBook.rating, { count: 1, average: 1 }, 'local browse fallback keeps its persisted rating');
});
