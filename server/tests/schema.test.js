'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, assertDbError } = require('./helpers');

const DUP = 'ER_DUP_ENTRY';
const CHECK = 'ER_CHECK_CONSTRAINT_VIOLATED';
const NO_PARENT = 'ER_NO_REFERENCED_ROW_2';
const HAS_CHILD = 'ER_ROW_IS_REFERENCED_2';

describe('database schema', () => {
  let testDb;
  let db; // pool
  let seq = 0;

  before(async () => {
    testDb = await createTestDatabase();
    db = testDb.pool;
  });
  after(async () => {
    await testDb.drop();
  });

  // ---- tiny fixture helpers (each call creates unique rows) ----------------
  const next = () => ++seq;

  async function addCustomer(overrides = {}) {
    const n = next();
    const row = {
      full_name: `Customer ${n}`,
      email: `customer${n}@example.com`,
      password_hash: '$2b$10$placeholderplaceholderplaceholderplaceholderplaceholde',
      terms_accepted_at: '2026-09-01 09:00:00',
      ...overrides,
    };
    const [r] = await db.query('INSERT INTO customers SET ?', [row]);
    return r.insertId;
  }

  async function addCategory(name = `Category ${next()}`) {
    const [r] = await db.query('INSERT INTO categories (name) VALUES (?)', [name]);
    return r.insertId;
  }

  async function addBook(overrides = {}) {
    const n = next();
    const categoryId = overrides.category_id ?? (await addCategory());
    const row = {
      isbn: `97810000${String(n).padStart(5, '0')}`,
      title: `Book ${n}`,
      author: `Author ${n}`,
      price: 199.0,
      category_id: categoryId,
      ...overrides,
    };
    const [r] = await db.query('INSERT INTO books SET ?', [row]);
    return r.insertId;
  }

  async function addOrder(customerId, overrides = {}) {
    const row = {
      customer_id: customerId,
      total_amount: 398.0,
      recipient_name: 'Test Person',
      phone: '9876543210',
      address_line1: '1 Test Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postal_code: '560085',
      country: 'India',
      ...overrides,
    };
    const [r] = await db.query('INSERT INTO orders SET ?', [row]);
    return r.insertId;
  }

  // ---------------------------------------------------------------------------
  it('creates every table the application needs', async () => {
    const [rows] = await db.query('SHOW TABLES');
    const tables = rows.map((r) => Object.values(r)[0]).sort();
    assert.deepEqual(tables, [
      'books',
      'cart_items',
      'carts',
      'categories',
      'customers',
      'delivery_details',
      'inventory',
      'order_items',
      'orders',
      'payments',
    ]);
  });

  describe('customers', () => {
    it('rejects a duplicate email', async () => {
      const id = next();
      await addCustomer({ email: `dup${id}@example.com` });
      await assertDbError(addCustomer({ email: `dup${id}@example.com` }), DUP);
    });

    it('treats email uniqueness as case-insensitive', async () => {
      const id = next();
      await addCustomer({ email: `Case${id}@Example.com` });
      await assertDbError(addCustomer({ email: `case${id}@example.com` }), DUP);
    });

    it('rejects a malformed email', async () => {
      await assertDbError(addCustomer({ email: 'not-an-email' }), CHECK);
    });

    it('defaults to the customer role and rejects unknown roles', async () => {
      const id = await addCustomer();
      const [[row]] = await db.query('SELECT role FROM customers WHERE id = ?', [id]);
      assert.equal(row.role, 'customer');
      await assertDbError(addCustomer({ role: 'superuser' }), 'WARN_DATA_TRUNCATED');
    });

    it('requires the terms-accepted timestamp', async () => {
      await assertDbError(addCustomer({ terms_accepted_at: null }), 'ER_BAD_NULL_ERROR');
    });
  });

  describe('books and categories', () => {
    it('rejects a duplicate ISBN', async () => {
      const isbn = '9781999999991';
      await addBook({ isbn });
      await assertDbError(addBook({ isbn }), DUP);
    });

    it('accepts ISBN-10 (with X check digit) and ISBN-13, rejects anything else', async () => {
      await addBook({ isbn: '080442957X' });
      await addBook({ isbn: '9781234567897' });
      await assertDbError(addBook({ isbn: '978-1-23456-789-7' }), 'ER_DATA_TOO_LONG'); // hyphens must be stripped before storing
      await assertDbError(addBook({ isbn: '97812345678AB' }), CHECK);
      await assertDbError(addBook({ isbn: '12345' }), CHECK);
    });

    it('rejects a negative price', async () => {
      await assertDbError(addBook({ price: -1 }), CHECK);
    });

    it('requires an existing category', async () => {
      await assertDbError(addBook({ category_id: 999999 }), NO_PARENT);
    });

    it('does not allow deleting a category that still has books', async () => {
      const categoryId = await addCategory();
      await addBook({ category_id: categoryId });
      await assertDbError(db.query('DELETE FROM categories WHERE id = ?', [categoryId]), HAS_CHILD);
    });

    it('rejects a duplicate category name', async () => {
      const name = `Unique ${next()}`;
      await addCategory(name);
      await assertDbError(addCategory(name), DUP);
    });
  });

  describe('inventory', () => {
    it('never allows negative stock', async () => {
      const bookId = await addBook();
      await db.query('INSERT INTO inventory (book_id, quantity) VALUES (?, 3)', [bookId]);
      await assertDbError(db.query('UPDATE inventory SET quantity = quantity - 4 WHERE book_id = ?', [bookId]), CHECK);
      const [[row]] = await db.query('SELECT quantity FROM inventory WHERE book_id = ?', [bookId]);
      assert.equal(row.quantity, 3, 'failed update must leave stock untouched');
    });

    it('allows only one inventory row per book', async () => {
      const bookId = await addBook();
      await db.query('INSERT INTO inventory (book_id, quantity) VALUES (?, 1)', [bookId]);
      await assertDbError(db.query('INSERT INTO inventory (book_id, quantity) VALUES (?, 5)', [bookId]), DUP);
    });

    it('requires an existing book and is removed together with its book', async () => {
      await assertDbError(db.query('INSERT INTO inventory (book_id, quantity) VALUES (999999, 1)'), NO_PARENT);

      const bookId = await addBook();
      await db.query('INSERT INTO inventory (book_id, quantity) VALUES (?, 1)', [bookId]);
      await db.query('DELETE FROM books WHERE id = ?', [bookId]);
      const [rows] = await db.query('SELECT 1 FROM inventory WHERE book_id = ?', [bookId]);
      assert.equal(rows.length, 0);
    });
  });

  describe('carts', () => {
    it('allows only one cart per customer', async () => {
      const customerId = await addCustomer();
      await db.query('INSERT INTO carts (customer_id) VALUES (?)', [customerId]);
      await assertDbError(db.query('INSERT INTO carts (customer_id) VALUES (?)', [customerId]), DUP);
    });

    it('keeps one line per book and rejects zero quantities', async () => {
      const customerId = await addCustomer();
      const [{ insertId: cartId }] = await db.query('INSERT INTO carts (customer_id) VALUES (?)', [customerId]);
      const bookId = await addBook();
      await db.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, ?, 2)', [cartId, bookId]);
      await assertDbError(
        db.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, ?, 1)', [cartId, bookId]),
        DUP
      );
      const other = await addBook();
      await assertDbError(
        db.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, ?, 0)', [cartId, other]),
        CHECK
      );
    });

    it('requires an existing book', async () => {
      const customerId = await addCustomer();
      const [{ insertId: cartId }] = await db.query('INSERT INTO carts (customer_id) VALUES (?)', [customerId]);
      await assertDbError(
        db.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, 999999, 1)', [cartId]),
        NO_PARENT
      );
    });

    it('removes the cart, its items and delivery details with the customer', async () => {
      const customerId = await addCustomer();
      const [{ insertId: cartId }] = await db.query('INSERT INTO carts (customer_id) VALUES (?)', [customerId]);
      const bookId = await addBook();
      await db.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, ?, 1)', [cartId, bookId]);
      await db.query(
        `INSERT INTO delivery_details
           (cart_id, recipient_name, phone, address_line1, city, state, postal_code, country)
         VALUES (?, 'A', '9876543210', '1 Road', 'Pune', 'MH', '411001', 'India')`,
        [cartId]
      );

      await db.query('DELETE FROM customers WHERE id = ?', [customerId]);

      const remaining = async (table, column) => {
        const [rows] = await db.query(`SELECT 1 FROM ${table} WHERE ${column} = ?`, [cartId]);
        return rows.length;
      };
      assert.equal(await remaining('carts', 'id'), 0);
      assert.equal(await remaining('cart_items', 'cart_id'), 0);
      assert.equal(await remaining('delivery_details', 'cart_id'), 0);
    });
  });

  describe('orders and order items', () => {
    it('starts as Pending and rejects unknown statuses', async () => {
      const customerId = await addCustomer();
      const orderId = await addOrder(customerId);
      const [[row]] = await db.query('SELECT status FROM orders WHERE id = ?', [orderId]);
      assert.equal(row.status, 'Pending');
      await assertDbError(addOrder(customerId, { status: 'Lost' }), 'WARN_DATA_TRUNCATED');
    });

    it('does not allow deleting a customer who has orders', async () => {
      const customerId = await addCustomer();
      await addOrder(customerId);
      await assertDbError(db.query('DELETE FROM customers WHERE id = ?', [customerId]), HAS_CHILD);
    });

    it('lets a retried request reuse an idempotency key only once per customer', async () => {
      const a = await addCustomer();
      const b = await addCustomer();
      await addOrder(a, { idempotency_key: 'retry-key-1' });
      await assertDbError(addOrder(a, { idempotency_key: 'retry-key-1' }), DUP);
      await addOrder(b, { idempotency_key: 'retry-key-1' }); // different customer: fine
      await addOrder(a); // orders without a key never collide
      await addOrder(a);
    });

    it('rejects a negative order total', async () => {
      const customerId = await addCustomer();
      await assertDbError(addOrder(customerId, { total_amount: -5 }), CHECK);
    });

    it('lists each book once per order, with a positive quantity and a non-negative price', async () => {
      const customerId = await addCustomer();
      const orderId = await addOrder(customerId);
      const bookId = await addBook();
      const insert = (qty, price, book = bookId) =>
        db.query('INSERT INTO order_items (order_id, book_id, quantity, unit_price) VALUES (?, ?, ?, ?)', [
          orderId,
          book,
          qty,
          price,
        ]);
      await insert(2, 199);
      await assertDbError(insert(1, 199), DUP);
      const other = await addBook();
      await assertDbError(insert(0, 199, other), CHECK);
      await assertDbError(insert(1, -1, other), CHECK);
    });

    it('keeps the purchase-time price when the catalogue price changes (BR-3)', async () => {
      const customerId = await addCustomer();
      const bookId = await addBook({ price: 300 });
      const orderId = await addOrder(customerId, { total_amount: 300 });
      await db.query('INSERT INTO order_items (order_id, book_id, quantity, unit_price) VALUES (?, ?, 1, 300)', [
        orderId,
        bookId,
      ]);
      await db.query('UPDATE books SET price = 450 WHERE id = ?', [bookId]);
      const [[item]] = await db.query('SELECT unit_price FROM order_items WHERE order_id = ?', [orderId]);
      assert.equal(item.unit_price, 300);
    });

    it('does not allow deleting a book that appears in an order', async () => {
      const customerId = await addCustomer();
      const bookId = await addBook();
      const orderId = await addOrder(customerId);
      await db.query('INSERT INTO order_items (order_id, book_id, quantity, unit_price) VALUES (?, ?, 1, 199)', [
        orderId,
        bookId,
      ]);
      await assertDbError(db.query('DELETE FROM books WHERE id = ?', [bookId]), HAS_CHILD);
    });

    it('removes the items together with their order', async () => {
      const customerId = await addCustomer();
      const bookId = await addBook();
      const orderId = await addOrder(customerId);
      await db.query('INSERT INTO order_items (order_id, book_id, quantity, unit_price) VALUES (?, ?, 1, 199)', [
        orderId,
        bookId,
      ]);
      await db.query('DELETE FROM orders WHERE id = ?', [orderId]);
      const [rows] = await db.query('SELECT 1 FROM order_items WHERE order_id = ?', [orderId]);
      assert.equal(rows.length, 0);
    });
  });

  describe('payments', () => {
    let customerId;
    before(async () => {
      customerId = await addCustomer();
    });

    const pay = (fields) =>
      db.query('INSERT INTO payments SET ?', [{ customer_id: customerId, amount: 398, ...fields }]);

    it('allows several failed attempts, including ones before an order exists', async () => {
      await pay({ status: 'Failed', failure_reason: 'card declined' });
      await pay({ status: 'Failed', failure_reason: 'card declined' });
      const orderId = await addOrder(customerId);
      await pay({ order_id: orderId, status: 'Failed', gateway_reference: `fail-${next()}` });
    });

    it('allows a failed attempt followed by one success for the same order', async () => {
      const orderId = await addOrder(customerId);
      await pay({ order_id: orderId, status: 'Failed', gateway_reference: `fail-${next()}` });
      await pay({ order_id: orderId, status: 'Succeeded', gateway_reference: `ok-${next()}` });
    });

    it('rejects a second successful payment for the same order', async () => {
      const orderId = await addOrder(customerId);
      await pay({ order_id: orderId, status: 'Succeeded', gateway_reference: `ok-${next()}` });
      await assertDbError(pay({ order_id: orderId, status: 'Succeeded', gateway_reference: `ok-${next()}` }), DUP);
    });

    it('rejects a success without an order or without a gateway reference', async () => {
      const orderId = await addOrder(customerId);
      await assertDbError(pay({ status: 'Succeeded', gateway_reference: `ok-${next()}` }), CHECK);
      await assertDbError(pay({ order_id: orderId, status: 'Succeeded' }), CHECK);
    });

    it('records the same gateway reference only once', async () => {
      const reference = `gw-${next()}`;
      await pay({ status: 'Failed', gateway_reference: reference });
      await assertDbError(pay({ status: 'Failed', gateway_reference: reference }), DUP);
    });

    it('does not allow deleting an order that has payments', async () => {
      const orderId = await addOrder(customerId);
      await pay({ order_id: orderId, status: 'Failed', gateway_reference: `fail-${next()}` });
      await assertDbError(db.query('DELETE FROM orders WHERE id = ?', [orderId]), HAS_CHILD);
    });

    it('rejects a negative amount and unknown statuses', async () => {
      await assertDbError(pay({ amount: -1 }), CHECK);
      await assertDbError(pay({ status: 'Refunded' }), 'WARN_DATA_TRUNCATED');
    });
  });
});

describe('seed data', () => {
  let testDb;
  before(async () => {
    testDb = await createTestDatabase({ seed: true });
  });
  after(async () => {
    await testDb.drop();
  });

  it('loads without violating any constraint and gives every book an inventory row', async () => {
    const [[books]] = await testDb.pool.query('SELECT COUNT(*) AS n FROM books');
    const [[inv]] = await testDb.pool.query('SELECT COUNT(*) AS n FROM inventory');
    assert.ok(books.n >= 20, 'expected a meaningful sample catalogue');
    assert.equal(inv.n, books.n);
  });

  it('includes out-of-stock books, an admin, customers and a ready-to-checkout cart', async () => {
    const q = (sql) => testDb.pool.query(sql).then(([rows]) => rows);
    assert.ok((await q('SELECT 1 FROM inventory WHERE quantity = 0')).length > 0);
    assert.equal((await q("SELECT 1 FROM customers WHERE role = 'admin'")).length, 1);
    assert.ok((await q("SELECT 1 FROM customers WHERE role = 'customer'")).length >= 2);
    assert.ok((await q('SELECT 1 FROM cart_items')).length >= 2);
  });

  it('cannot be used to log in (no usable password hash)', async () => {
    const [rows] = await testDb.pool.query("SELECT password_hash FROM customers WHERE password_hash NOT LIKE '!%'");
    assert.equal(rows.length, 0);
  });
});
