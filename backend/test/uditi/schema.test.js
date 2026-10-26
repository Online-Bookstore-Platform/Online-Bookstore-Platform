import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertDbError, createFixtures, createTestDatabase, databaseTests } from './helpers.js';
import { setupDatabase } from '../../database/setup.js';
import { databaseConfigFromEnv } from '../../src/config/database.js';

const DUP = 'ER_DUP_ENTRY';
const CHECK = 'ER_CHECK_CONSTRAINT_VIOLATED';
const NO_PARENT = 'ER_NO_REFERENCED_ROW_2';
const HAS_CHILD = 'ER_ROW_IS_REFERENCED_2';
const BAD_ENUM = 'WARN_DATA_TRUNCATED';

describe('database schema (#13)', databaseTests, () => {
  let testDb;
  let db;
  let f;

  before(async () => {
    testDb = await createTestDatabase();
    db = testDb.pool;
    f = createFixtures(db);
  });
  after(async () => {
    await testDb.drop();
  });

  it('creates every table the application needs', async () => {
    const [rows] = await db.query('SHOW TABLES');
    const tables = rows.map(row => Object.values(row)[0]).sort();
    assert.deepEqual(tables, [
      'book_reviews',
      'books',
      'cart_items',
      'carts',
      'categories',
      'delivery_details',
      'inventory',
      'inventory_adjustments',
      'order_items',
      'order_status_history',
      'orders',
      'password_reset_tokens',
      'payments',
      'presentation_products',
      'sessions',
      'users',
    ]);
  });

  describe('book reviews', () => {
    it('supports local customer reviews and user-less demo reviews with explicit markers', async () => {
      const bookId = await f.addBook();
      const userId = await f.addUser();
      await db.query(`INSERT INTO book_reviews (book_id, local_book_id, user_id, rating, content)
        VALUES (?, ?, ?, 5, 'A useful customer review.')`, [`local:${bookId}`, bookId, userId]);
      await db.query(`INSERT INTO book_reviews (book_id, local_book_id, is_demo, demo_label, demo_key, rating, content)
        VALUES (?, ?, 1, 'Folio Demo Reader 01', ?, 4, 'A clearly identified sample review.')`,
      [`local:${bookId}`, bookId, `schema-demo-${f.next()}`]);
      const [[result]] = await db.query(`SELECT COUNT(*) AS count, SUM(is_demo = 1) AS demos
        FROM book_reviews WHERE local_book_id = ?`, [bookId]);
      assert.equal(Number(result.count), 2);
      assert.equal(Number(result.demos), 1);
      await assertDbError(db.query(`INSERT INTO book_reviews (book_id, local_book_id, user_id, rating, content)
        VALUES ('local:999999', 999999, ?, 5, 'A review with no matching book.')`, [userId]), NO_PARENT);
    });
  });

  describe('users', () => {
    it('rejects a duplicate email, ignoring letter case', async () => {
      const n = f.next();
      await f.addUser({ email: `dup${n}@example.com` });
      await assertDbError(f.addUser({ email: `dup${n}@example.com` }), DUP);
      await assertDbError(f.addUser({ email: `DUP${n}@Example.com` }), DUP);
    });

    it('rejects a malformed email', async () => {
      await assertDbError(f.addUser({ email: 'not-an-email' }), CHECK);
    });

    it('defaults to the customer role and rejects unknown roles', async () => {
      const id = await f.addUser();
      const [[row]] = await db.query('SELECT role FROM users WHERE id = ?', [id]);
      assert.equal(row.role, 'customer');
      await assertDbError(f.addUser({ role: 'superuser' }), BAD_ENUM);
    });

    it('requires a name, an email, a password hash and the terms-accepted time', async () => {
      await assertDbError(f.addUser({ name: null }), 'ER_BAD_NULL_ERROR');
      await assertDbError(f.addUser({ email: null }), 'ER_BAD_NULL_ERROR');
      await assertDbError(f.addUser({ password_hash: null }), 'ER_BAD_NULL_ERROR');
      await assertDbError(f.addUser({ terms_accepted_at: null }), 'ER_BAD_NULL_ERROR');
    });
  });

  describe('books and categories', () => {
    it('rejects a duplicate ISBN', async () => {
      const isbn = '9781999999991';
      await f.addBook({ isbn });
      await assertDbError(f.addBook({ isbn }), DUP);
    });

    it('accepts ISBN-10 (with an X check digit) and ISBN-13, rejects anything else', async () => {
      await f.addBook({ isbn: '080442957X' });
      await f.addBook({ isbn: '9781234567897' });
      await assertDbError(f.addBook({ isbn: '978-1-23456-789-7' }), 'ER_DATA_TOO_LONG'); // hyphens are stripped before storing
      await assertDbError(f.addBook({ isbn: '97812345678AB' }), CHECK);
      await assertDbError(f.addBook({ isbn: '12345' }), CHECK);
    });

    it('rejects a negative price', async () => {
      await assertDbError(f.addBook({ price: -1 }), CHECK);
    });

    it('requires an existing category', async () => {
      await assertDbError(f.addBook({ category_id: 999999 }), NO_PARENT);
    });

    it('does not allow deleting a category that still has books', async () => {
      const categoryId = await f.addCategory();
      await f.addBook({ category_id: categoryId });
      await assertDbError(db.query('DELETE FROM categories WHERE id = ?', [categoryId]), HAS_CHILD);
    });

    it('rejects a duplicate category name', async () => {
      const name = `Unique ${f.next()}`;
      await f.addCategory(name);
      await assertDbError(f.addCategory(name), DUP);
    });
  });

  describe('inventory', () => {
    it('never allows negative stock', async () => {
      const bookId = await f.addBook({ quantity: 3 });
      await assertDbError(db.query('UPDATE inventory SET quantity = quantity - 4 WHERE book_id = ?', [bookId]), CHECK);
      assert.equal(await f.stockOf(bookId), 3, 'a failed update must leave the stock untouched');
      await assertDbError(f.addBook({ quantity: -1 }), CHECK);
    });

    it('allows only one inventory row per book', async () => {
      const bookId = await f.addBook({ quantity: 1 });
      await assertDbError(db.query('INSERT INTO inventory (book_id, quantity) VALUES (?, 5)', [bookId]), DUP);
    });

    it('requires an existing book and is removed together with its book', async () => {
      await assertDbError(db.query('INSERT INTO inventory (book_id, quantity) VALUES (999999, 1)'), NO_PARENT);

      const bookId = await f.addBook({ quantity: 1 });
      await db.query('DELETE FROM books WHERE id = ?', [bookId]);
      const [rows] = await db.query('SELECT 1 FROM inventory WHERE book_id = ?', [bookId]);
      assert.equal(rows.length, 0);
    });

    it('keeps an audit row for each adjustment and never allows a negative quantity in it', async () => {
      const adminId = await f.addUser({ role: 'admin' });
      const bookId = await f.addBook({ quantity: 4 });
      await db.query(
        'INSERT INTO inventory_adjustments (book_id, admin_id, quantity_before, quantity_after, reason) VALUES (?, ?, 4, 9, ?)',
        [bookId, adminId, 'delivery']
      );
      await assertDbError(
        db.query('INSERT INTO inventory_adjustments (book_id, admin_id, quantity_before, quantity_after) VALUES (?, ?, 4, -1)', [bookId, adminId]),
        CHECK
      );
      await assertDbError(db.query('DELETE FROM users WHERE id = ?', [adminId]), HAS_CHILD);
    });
  });

  describe('carts', () => {
    it('allows only one cart per user', async () => {
      const userId = await f.addUser();
      await db.query('INSERT INTO carts (user_id) VALUES (?)', [userId]);
      await assertDbError(db.query('INSERT INTO carts (user_id) VALUES (?)', [userId]), DUP);
    });

    it('keeps one line per book and rejects zero quantities', async () => {
      const userId = await f.addUser();
      const cartId = await f.fillCart(userId, []);
      const bookId = await f.addBook();
      await db.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, ?, 2)', [cartId, bookId]);
      await assertDbError(db.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, ?, 1)', [cartId, bookId]), DUP);
      const other = await f.addBook();
      await assertDbError(db.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, ?, 0)', [cartId, other]), CHECK);
    });

    it('requires an existing book', async () => {
      const userId = await f.addUser();
      const cartId = await f.fillCart(userId, []);
      await assertDbError(db.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, 999999, 1)', [cartId]), NO_PARENT);
    });

    it('removes the cart, its items and the delivery details together with the user', async () => {
      const userId = await f.addUser();
      const bookId = await f.addBook();
      const cartId = await f.fillCart(userId, [{ bookId, quantity: 1 }]);
      await db.query(
        `INSERT INTO delivery_details (user_id, recipient_name, phone, address_line1, city, state, postal_code, country)
         VALUES (?, 'A', '9876543210', '1 Road', 'Pune', 'MH', '411001', 'India')`,
        [userId]
      );

      await db.query('DELETE FROM users WHERE id = ?', [userId]);

      const remaining = async (table, column, value) => (await db.query(`SELECT 1 FROM ${table} WHERE ${column} = ?`, [value]))[0].length;
      assert.equal(await remaining('carts', 'id', cartId), 0);
      assert.equal(await remaining('cart_items', 'cart_id', cartId), 0);
      assert.equal(await remaining('delivery_details', 'user_id', userId), 0);
    });
  });

  describe('orders and order items', () => {
    it('starts as pending and rejects unknown statuses', async () => {
      const userId = await f.addUser();
      const orderId = await f.addOrder(userId);
      const [[row]] = await db.query('SELECT status FROM orders WHERE id = ?', [orderId]);
      assert.equal(row.status, 'pending');
      await assertDbError(f.addOrder(userId, { status: 'lost' }), BAD_ENUM);
    });

    it('accepts every status of the order lifecycle', async () => {
      const userId = await f.addUser();
      for (const status of ['pending', 'payment_failed', 'paid', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']) {
        await f.addOrder(userId, { status });
      }
    });

    it('requires a unique, well-formed order number', async () => {
      const userId = await f.addUser();
      await f.addOrder(userId, { order_number: 'ORD-UNIQUE-1' });
      await assertDbError(f.addOrder(userId, { order_number: 'ORD-UNIQUE-1' }), DUP);
      await assertDbError(f.addOrder(userId, { order_number: 'no spaces allowed' }), CHECK);
      await assertDbError(f.addOrder(userId, { order_number: 'ab' }), CHECK);
    });

    it('does not allow deleting a user who has orders', async () => {
      const userId = await f.addUser();
      await f.addOrder(userId);
      await assertDbError(db.query('DELETE FROM users WHERE id = ?', [userId]), HAS_CHILD);
    });

    it('lets a retried request reuse an idempotency key only once per user', async () => {
      const a = await f.addUser();
      const b = await f.addUser();
      await f.addOrder(a, { idempotency_key: 'retry-key-1' });
      await assertDbError(f.addOrder(a, { idempotency_key: 'retry-key-1' }), DUP);
      await f.addOrder(b, { idempotency_key: 'retry-key-1' }); // different user: fine
      await f.addOrder(a); // orders without a key never collide
      await f.addOrder(a);
    });

    it('rejects a negative order total', async () => {
      const userId = await f.addUser();
      await assertDbError(f.addOrder(userId, { total_amount: -5 }), CHECK);
    });

    it('lists each book once per order, with a positive quantity and a non-negative price', async () => {
      const userId = await f.addUser();
      const orderId = await f.addOrder(userId);
      const bookId = await f.addBook();
      const insert = (quantity, price, book = bookId) =>
        db.query('INSERT INTO order_items (order_id, book_id, book_title, quantity, unit_price) VALUES (?, ?, ?, ?, ?)', [orderId, book, 'Title', quantity, price]);
      await insert(2, 199);
      await assertDbError(insert(1, 199), DUP);
      const other = await f.addBook();
      await assertDbError(insert(0, 199, other), CHECK);
      await assertDbError(insert(1, -1, other), CHECK);
    });

    it('keeps the purchase-time price when the catalogue price changes (BR-3)', async () => {
      const userId = await f.addUser();
      const bookId = await f.addBook({ price: 300 });
      const orderId = await f.addOrder(userId, { total_amount: 300 });
      await db.query("INSERT INTO order_items (order_id, book_id, book_title, quantity, unit_price) VALUES (?, ?, 'Old title', 1, 300)", [orderId, bookId]);
      await db.query("UPDATE books SET price = 450, title = 'New title' WHERE id = ?", [bookId]);
      const [[item]] = await db.query('SELECT unit_price, book_title FROM order_items WHERE order_id = ?', [orderId]);
      assert.equal(item.unit_price, 300);
      assert.equal(item.book_title, 'Old title');
    });

    it('does not allow deleting a book that appears in an order', async () => {
      const userId = await f.addUser();
      const bookId = await f.addBook();
      const orderId = await f.addOrder(userId);
      await db.query("INSERT INTO order_items (order_id, book_id, book_title, quantity, unit_price) VALUES (?, ?, 'T', 1, 199)", [orderId, bookId]);
      await assertDbError(db.query('DELETE FROM books WHERE id = ?', [bookId]), HAS_CHILD);
    });

    it('does not allow deleting an order that has items', async () => {
      const userId = await f.addUser();
      const bookId = await f.addBook();
      const orderId = await f.addOrder(userId);
      await db.query("INSERT INTO order_items (order_id, book_id, book_title, quantity, unit_price) VALUES (?, ?, 'T', 1, 199)", [orderId, bookId]);
      await assertDbError(db.query('DELETE FROM orders WHERE id = ?', [orderId]), HAS_CHILD);
    });
  });

  describe('order status history', () => {
    it('records changes in order, with the user who made them (or the system)', async () => {
      const userId = await f.addUser();
      const adminId = await f.addUser({ role: 'admin' });
      const orderId = await f.addOrder(userId);
      await db.query("INSERT INTO order_status_history (order_id, from_status, to_status) VALUES (?, NULL, 'pending')", [orderId]);
      await db.query("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note) VALUES (?, 'pending', 'shipped', ?, 'Dispatched')", [orderId, adminId]);
      const [rows] = await db.query('SELECT from_status, to_status, changed_by FROM order_status_history WHERE order_id = ? ORDER BY id', [orderId]);
      assert.deepEqual(rows.map(row => [row.from_status, row.to_status]), [[null, 'pending'], ['pending', 'shipped']]);
      assert.equal(rows[0].changed_by, null);
      assert.equal(rows[1].changed_by, adminId);
    });

    it('requires an existing order and keeps the history when an order is looked at later', async () => {
      await assertDbError(db.query("INSERT INTO order_status_history (order_id, to_status) VALUES (999999, 'pending')"), NO_PARENT);
      const userId = await f.addUser();
      const orderId = await f.addOrder(userId);
      await db.query("INSERT INTO order_status_history (order_id, to_status) VALUES (?, 'pending')", [orderId]);
      await assertDbError(db.query('DELETE FROM orders WHERE id = ?', [orderId]), HAS_CHILD);
    });

    it('keeps the history if the administrator account is removed', async () => {
      const userId = await f.addUser();
      const adminId = await f.addUser({ role: 'admin' });
      const orderId = await f.addOrder(userId);
      await db.query("INSERT INTO order_status_history (order_id, to_status, changed_by) VALUES (?, 'confirmed', ?)", [orderId, adminId]);
      await db.query('DELETE FROM users WHERE id = ?', [adminId]);
      const [[row]] = await db.query('SELECT changed_by FROM order_status_history WHERE order_id = ?', [orderId]);
      assert.equal(row.changed_by, null);
    });
  });

  describe('payments', () => {
    let userId;
    before(async () => {
      userId = await f.addUser();
    });

    const pay = fields =>
      db.query('INSERT INTO payments SET ?', [{ idempotency_key: `idem-${f.next()}`, user_id: userId, amount: 398, ...fields }]);

    it('allows several failed, cancelled and timed-out attempts for one order', async () => {
      const orderId = await f.addOrder(userId);
      await pay({ order_id: orderId, status: 'failed' });
      await pay({ order_id: orderId, status: 'failed' });
      await pay({ order_id: orderId, status: 'cancelled' });
      await pay({ order_id: orderId, status: 'timed_out' });
    });

    it('allows a failed attempt followed by one success for the same order', async () => {
      const orderId = await f.addOrder(userId);
      await pay({ order_id: orderId, status: 'failed' });
      await pay({ order_id: orderId, status: 'succeeded', provider_reference: `ok-${f.next()}` });
    });

    it('rejects a second successful payment for the same order', async () => {
      const orderId = await f.addOrder(userId);
      await pay({ order_id: orderId, status: 'succeeded', provider_reference: `ok-${f.next()}` });
      await assertDbError(pay({ order_id: orderId, status: 'succeeded', provider_reference: `ok-${f.next()}` }), DUP);
    });

    it('rejects a second pending attempt, but allows a new one once the first is settled', async () => {
      const orderId = await f.addOrder(userId);
      const [{ insertId: first }] = await pay({ order_id: orderId, status: 'pending' });
      await assertDbError(pay({ order_id: orderId, status: 'pending' }), DUP);
      await db.query("UPDATE payments SET status = 'failed' WHERE id = ?", [first]);
      await pay({ order_id: orderId, status: 'pending' });
    });

    it('lets two different orders each have a pending attempt', async () => {
      await pay({ order_id: await f.addOrder(userId), status: 'pending' });
      await pay({ order_id: await f.addOrder(userId), status: 'pending' });
    });

    it('accepts a payment only for an existing order and user', async () => {
      await assertDbError(pay({ order_id: 999999 }), NO_PARENT);
      await assertDbError(pay({ order_id: await f.addOrder(userId), user_id: 999999 }), NO_PARENT);
    });

    it('records the same idempotency key and the same provider reference only once', async () => {
      const orderId = await f.addOrder(userId);
      await pay({ order_id: orderId, status: 'failed', idempotency_key: 'same-key', provider_reference: 'gw-1' });
      await assertDbError(pay({ order_id: orderId, status: 'failed', idempotency_key: 'same-key' }), DUP);
      await assertDbError(pay({ order_id: orderId, status: 'failed', provider_reference: 'gw-1' }), DUP);
    });

    it('does not allow deleting an order that has payments', async () => {
      const orderId = await f.addOrder(userId);
      await pay({ order_id: orderId, status: 'failed' });
      await assertDbError(db.query('DELETE FROM orders WHERE id = ?', [orderId]), HAS_CHILD);
    });

    it('rejects a zero or negative amount and unknown statuses', async () => {
      const orderId = await f.addOrder(userId);
      await assertDbError(pay({ order_id: orderId, amount: 0 }), CHECK);
      await assertDbError(pay({ order_id: orderId, amount: -1 }), CHECK);
      await assertDbError(pay({ order_id: orderId, status: 'refunded' }), BAD_ENUM);
    });
  });

  describe('sessions', () => {
    it('has the layout the express-mysql-session package expects', async () => {
      const [columns] = await db.query('SHOW COLUMNS FROM sessions');
      assert.deepEqual(columns.map(column => column.Field), ['session_id', 'expires', 'data']);
    });
  });
});

describe('database setup script (#13)', databaseTests, () => {
  const base = databaseConfigFromEnv();
  const name = `bookstore_setup_${process.pid}_${Date.now().toString(36)}`;
  const config = { ...base, database: name };
  after(async () => {
    const mysql = (await import('mysql2/promise')).default;
    const { database: _ignored, ...serverConfig } = base;
    const connection = await mysql.createConnection(serverConfig);
    await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await connection.end();
  });

  it('applies the schema once and then does nothing', async () => {
    assert.deepEqual(await setupDatabase({ config }), { schemaApplied: true, seeded: false });
    assert.deepEqual(await setupDatabase({ config }), { schemaApplied: false, seeded: false });
  });

  it('refuses to load sample data into a database that already has tables', async () => {
    await assert.rejects(setupDatabase({ config, seed: true }), /already has tables/);
  });

  it('--reset rebuilds the database with the sample data', async () => {
    assert.deepEqual(await setupDatabase({ config, reset: true, seed: true }), { schemaApplied: true, seeded: true });
  });

  it('rejects unsafe database names and weak demo passwords', async () => {
    await assert.rejects(setupDatabase({ config: { ...base, database: 'x`; DROP DATABASE y; --' } }), /DB_NAME/);
    await assert.rejects(setupDatabase({ config, reset: true, seed: true, demoPassword: 'short' }), /8-200/);
  });

  it('stores only a bcrypt hash of the demo password, never the password', async () => {
    const mysql = (await import('mysql2/promise')).default;
    await setupDatabase({ config, reset: true, seed: true, demoPassword: 'a-demo-password-1' });
    const connection = await mysql.createConnection(config);
    try {
      const [rows] = await connection.query('SELECT email, password_hash FROM users');
      assert.ok(rows.length >= 3);
      for (const row of rows) {
        assert.match(row.password_hash, /^\$2[aby]\$12\$/);
        assert.ok(!row.password_hash.includes('a-demo-password-1'));
      }
    } finally {
      await connection.end();
    }
  });
});

describe('seed data (#13)', databaseTests, () => {
  let testDb;
  before(async () => {
    testDb = await createTestDatabase({ seed: true });
  });
  after(async () => {
    await testDb.drop();
  });

  const rows = sql => testDb.pool.query(sql).then(([result]) => result);

  it('loads without violating any constraint and gives every book an inventory row', async () => {
    const [{ n: books }] = await rows('SELECT COUNT(*) AS n FROM books');
    const [{ n: inventory }] = await rows('SELECT COUNT(*) AS n FROM inventory');
    assert.ok(books >= 20, 'expected a meaningful sample catalogue');
    assert.equal(inventory, books);
  });

  it('includes out-of-stock and low-stock books, an admin, customers and a ready-to-checkout cart', async () => {
    assert.ok((await rows('SELECT 1 FROM inventory WHERE quantity = 0')).length > 0);
    assert.ok((await rows('SELECT 1 FROM inventory WHERE quantity BETWEEN 1 AND 5')).length > 0);
    assert.equal((await rows("SELECT 1 FROM users WHERE role = 'admin'")).length, 1);
    assert.ok((await rows("SELECT 1 FROM users WHERE role = 'customer'")).length >= 2);
    assert.ok((await rows('SELECT 1 FROM cart_items')).length >= 2);
  });

  it('cannot be used to log in (no usable password hash) and holds no real contact data', async () => {
    assert.equal((await rows("SELECT password_hash FROM users WHERE password_hash NOT LIKE '!%'")).length, 0);
    // Only reserved example domains (RFC 2606), never a real mailbox.
    assert.equal((await rows("SELECT email FROM users WHERE email NOT LIKE '%.example' AND email NOT LIKE '%@example.%'")).length, 0);
  });
});

describe('schema file (#13)', () => {
  it('contains no secrets or card data columns', async () => {
    const sql = (await readFile(fileURLToPath(new URL('../../database/schema.sql', import.meta.url)), 'utf8')).toLowerCase();
    for (const forbidden of ['card_number', 'cvv', 'cvc', 'expiry', 'api_key', 'secret']) {
      assert.ok(!sql.includes(forbidden), `schema.sql must not mention ${forbidden}`);
    }
  });
});
