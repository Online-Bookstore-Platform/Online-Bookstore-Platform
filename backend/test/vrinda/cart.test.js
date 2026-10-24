import test from 'node:test';
import assert from 'node:assert/strict';
import { createCartService } from '../../src/features/vrinda/cart/cart.service.js';
import { parseCartItem, parseItemId, parseQuantity } from '../../src/features/vrinda/cart/cart.validation.js';

test('cart input validates book ids and positive integer quantities', () => {
  assert.deepEqual(parseCartItem({ bookId: '12' }), { bookId: 12, quantity: 1 });
  assert.equal(parseItemId('12'), 12);
  assert.equal(parseQuantity({ quantity: 3 }), 3);
  assert.throws(() => parseItemId('0'), error => error.status === 400);
  assert.throws(() => parseQuantity({ quantity: 1.5 }), error => error.status === 400);
});

test('adding a cart item scopes reads to the signed-in user and recalculates totals', async () => {
  const statements = [];
  const db = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.startsWith('SELECT id FROM carts')) return [[{ id: 7 }]];
      if (sql.startsWith('SELECT b.id AS bookId')) return [[{ bookId: 12, title: 'The Book', isActive: 1, quantity: 5 }]];
      if (sql.startsWith('SELECT quantity FROM cart_items')) return [[{ quantity: 1 }]];
      if (sql.startsWith('SELECT ci.book_id AS bookId')) {
        return [[{ bookId: 12, title: 'The Book', author: 'Author', isbn: '1234567890', coverImageUrl: null, isActive: 1, unitPrice: 15.5, quantity: 2, availableQuantity: 5 }]];
      }
      return [{ affectedRows: 1, insertId: 7 }];
    },
  };
  const service = createCartService({ pool: db, withTransaction: (_pool, work) => work(db) });

  const result = await service.add(44, { bookId: 12, quantity: 1 });

  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.totals.subtotal, 31);
  assert.ok(statements.some(statement => statement.sql.startsWith('SELECT id FROM carts') && statement.params[0] === 44));
  assert.ok(statements.some(statement => statement.sql.startsWith('INSERT INTO cart_items')));
});

test('cart refuses quantities greater than available stock', async () => {
  const db = {
    async query(sql) {
      if (sql.startsWith('INSERT INTO carts')) return [{ affectedRows: 1, insertId: 7 }];
      if (sql.startsWith('SELECT id FROM carts')) return [[{ id: 7 }]];
      if (sql.startsWith('SELECT b.id AS bookId')) return [[{ bookId: 12, title: 'The Book', isActive: 1, quantity: 1 }]];
      if (sql.startsWith('SELECT quantity FROM cart_items')) return [[{ quantity: 1 }]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const service = createCartService({ pool: db, withTransaction: (_pool, work) => work(db) });

  await assert.rejects(service.add(44, { bookId: 12, quantity: 1 }), error => error.status === 409 && error.code === 'INSUFFICIENT_STOCK');
});
