import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createFixtures, createTestDatabase, databaseTests } from './helpers.js';
import { resolvePresentationProduct } from '../../src/features/uditi/catalogue/presentation-store.js';
import { createCartService } from '../../src/features/vrinda/cart/cart.service.js';
import { withTransaction } from '../../src/features/uditi/shared/transaction.js';

describe('local presentation product resolution', databaseTests, () => {
  let testDb; let db; let f;
  const env = { CATALOGUE_DEMO_MODE: 'true', CATALOGUE_DEMO_PRICE_MIN: '199', CATALOGUE_DEMO_PRICE_MAX: '999', CATALOGUE_DEMO_INITIAL_STOCK: '7' };
  before(async () => { testDb = await createTestDatabase(); db = testDb.pool; f = createFixtures(db); });
  after(async () => { await testDb.drop(); });

  it('concurrently maps one external record to one persistent local product and stock row', async () => {
    const book = { provider: 'googlebooks', providerId: 'stable-volume-01', title: 'A discovered book', author: 'A. Reader', category: 'Fiction', isbns: [], description: 'Verified provider metadata.' };
    const ids = await Promise.all(Array.from({ length: 8 }, () => resolvePresentationProduct(db, book, env)));
    assert.equal(new Set(ids).size, 1);
    const id = ids[0];
    const [[row]] = await db.query('SELECT b.price, i.quantity FROM books b JOIN inventory i ON i.book_id = b.id WHERE b.id = ?', [id]);
    assert.ok(row.price >= 199 && row.price <= 999);
    assert.equal(row.quantity, 7);
    await db.query('UPDATE inventory SET quantity = 3 WHERE book_id = ?', [id]);
    assert.equal(await resolvePresentationProduct(db, book, env), id);
    const [[persisted]] = await db.query('SELECT b.price, i.quantity FROM books b JOIN inventory i ON i.book_id = b.id WHERE b.id = ?', [id]);
    assert.equal(persisted.price, row.price);
    assert.equal(persisted.quantity, 3);
    const [[mapped]] = await db.query('SELECT COUNT(*) AS n FROM presentation_products WHERE provider = ? AND provider_id = ?', [book.provider, book.providerId]);
    assert.equal(Number(mapped.n), 1);
  });

  it('maps a verified ISBN to an administered product without changing its price or stock', async () => {
    const bookId = await f.addBook({ isbn: '9780306406157', price: 725, title: 'Administered title', quantity: 4 });
    const providerBook = { provider: 'openlibrary', providerId: 'works/OL999W', title: 'Provider title', author: 'Provider author', category: 'Science', isbns: ['9780306406157'] };
    assert.equal(await resolvePresentationProduct(db, providerBook, env), Number(bookId));
    const [[row]] = await db.query('SELECT b.title, b.price, i.quantity FROM books b JOIN inventory i ON i.book_id = b.id WHERE b.id = ?', [bookId]);
    assert.deepEqual(row, { title: 'Administered title', price: 725, quantity: 4 });
  });

  it('adds the resolved local numeric ID to the signed-in customer cart', async () => {
    const productId = await resolvePresentationProduct(db, { provider: 'googlebooks', providerId: 'cart-volume-01', title: 'Cartable book', author: 'A. Reader', category: 'Fiction', isbns: [] }, env);
    const userId = await f.addUser();
    const cart = createCartService({ pool: db, withTransaction });
    const saved = await cart.add(userId, { bookId: productId, quantity: 1 });
    assert.equal(Number(saved.items[0].bookId), productId);
    const [[item]] = await db.query('SELECT ci.book_id, b.price FROM cart_items ci JOIN books b ON b.id = ci.book_id JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = ?', [userId]);
    assert.equal(Number(item.book_id), productId);
    assert.ok(item.price > 0);
  });
});
