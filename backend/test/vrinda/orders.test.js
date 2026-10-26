import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrdersService } from '../../src/features/vrinda/orders/orders.service.js';
import { parseIdempotencyKey, parseOrderDraft, parsePaymentMethod } from '../../src/features/vrinda/orders/orders.validation.js';

const delivery = {
  recipientName: 'Vrinda Venugopal',
  phone: '9876543210',
  addressLine1: '12 Library Road',
  addressLine2: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'India',
};

test('order draft validates saved delivery and idempotency keys', () => {
  assert.deepEqual(parseOrderDraft({ delivery }), { ...delivery, addressLine2: null });
  assert.equal(parseOrderDraft({}), null);
  assert.equal(parseIdempotencyKey('draft-1'), 'draft-1');
  assert.equal(parsePaymentMethod('cod'), 'cod');
  assert.equal(parsePaymentMethod(undefined), 'card');
  assert.throws(() => parsePaymentMethod('cash-app'), error => error.status === 400);
  assert.throws(() => parseOrderDraft({ delivery: { recipientName: 'Missing' } }), error => error.status === 400);
  assert.throws(() => parseIdempotencyKey(''), error => error.status === 400);
});

test('COD confirms an order as pending collection, deducts stock, and creates no payment attempt', async () => {
  const statements = [];
  const db = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.startsWith('SELECT id FROM carts')) return [[{ id: 5 }]];
      if (sql.startsWith('SELECT ci.book_id AS bookId')) return [[{ bookId: 3, quantity: 1, title: 'A Good Book', unitPrice: 12.5 }]];
      if (sql.startsWith('INSERT INTO orders')) return [{ insertId: 21 }];
      if (sql.startsWith('SELECT id, order_number AS orderNumber')) return [[{ id: 21, orderNumber: 'order-21', status: 'pending_collection', paymentMethod: 'cod', paymentStatus: 'pending_collection', totalAmount: 12.5, currency: 'INR' }]];
      if (sql.startsWith('SELECT book_id AS bookId')) return [[{ bookId: 3, title: 'A Good Book', quantity: 1, unitPrice: 12.5 }]];
      if (sql.startsWith('SELECT from_status AS fromStatus')) return [[{ fromStatus: null, toStatus: 'pending_collection', note: 'Cash due on delivery' }]];
      if (sql.startsWith('SELECT status, amount, currency')) return [[]];
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
  let deducted;
  const service = createOrdersService({ pool: db, checkAvailability: async () => ({ ok: true, shortages: [] }), withTransaction: (_pool, work) => work(db), deductStock: async (_connection, items) => { deducted = items; } });
  const order = await service.createDraft(8, delivery, null, 'cod');
  assert.equal(order.status, 'pending_collection');
  assert.equal(order.paymentMethod, 'cod');
  assert.equal(order.paymentStatus, 'pending_collection');
  assert.deepEqual(deducted, [{ bookId: 3, quantity: 1 }]);
  assert.ok(statements.some(({ sql }) => sql.includes('payment_method')));
  assert.ok(statements.some(({ sql }) => sql.toLowerCase().includes('payment is due on delivery')));
  assert.equal(statements.some(({ sql }) => sql.startsWith('INSERT INTO payments')), false);
});

test('draft creation snapshots server prices and clears only the owner cart', async () => {
  const statements = [];
  const db = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.startsWith('SELECT id FROM carts')) return [[{ id: 5 }]];
      if (sql.startsWith('SELECT ci.book_id AS bookId')) return [[{ bookId: 3, quantity: 2, title: 'A Good Book', unitPrice: 12.5 }]];
      if (sql.startsWith('INSERT INTO orders')) return [{ insertId: 21 }];
      if (sql.startsWith('SELECT id, order_number AS orderNumber')) {
        return [[{ id: 21, orderNumber: 'order-21', status: 'pending', totalAmount: 25, currency: 'INR', createdAt: new Date() }]];
      }
      if (sql.startsWith('SELECT book_id AS bookId')) return [[{ bookId: 3, title: 'A Good Book', quantity: 2, unitPrice: 12.5 }]];
      if (sql.startsWith('SELECT from_status AS fromStatus')) return [[{ fromStatus: null, toStatus: 'pending', note: 'Awaiting payment', createdAt: new Date() }]];
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
  const service = createOrdersService({
    pool: db,
    checkAvailability: async (_connection, items) => {
      assert.deepEqual(items, [{ bookId: 3, quantity: 2 }]);
      return { ok: true, shortages: [] };
    },
    withTransaction: (_pool, work) => work(db),
  });

  const order = await service.createDraft(8, delivery, null);

  assert.equal(order.totalAmount, 25);
  assert.equal(order.items[0].lineTotal, 25);
  assert.ok(statements.some(statement => statement.sql.startsWith('INSERT INTO orders') && statement.params[1] === 8 && statement.params[2] === 25));
  assert.ok(statements.some(statement => statement.sql.startsWith('INSERT INTO order_items') && statement.params[2] === 'A Good Book' && statement.params[4] === 12.5));
  assert.ok(statements.some(statement => statement.sql.startsWith('DELETE FROM cart_items')));
});

test('order detail lookup is scoped to the current customer', async () => {
  let parameters;
  const service = createOrdersService({
    pool: {
      async query(_sql, params) {
        parameters = params;
        return [[]];
      },
    },
    checkAvailability: async () => ({ ok: true, shortages: [] }),
    withTransaction: (_pool, work) => work(),
  });

  await assert.rejects(service.get(44, 72), error => error.status === 404);
  assert.deepEqual(parameters, [44, 72]);
});

test('saved payment attempts are returned with an owned order', async () => {
  const service = createOrdersService({
    pool: {
      async query(sql) {
        if (sql.startsWith('SELECT id, order_number AS orderNumber')) return [[{ id: 72, orderNumber: 'order-72', status: 'paid', totalAmount: 25, currency: 'INR' }]];
        if (sql.startsWith('SELECT status, amount, currency, created_at AS createdAt')) return [[{ status: 'succeeded', amount: 25, currency: 'INR' }]];
        return [[]];
      },
    },
    checkAvailability: async () => ({ ok: true, shortages: [] }),
    withTransaction: (_pool, work) => work(),
  });

  const { order } = await service.tracking(8, 72);
  assert.deepEqual(order.paymentAttempts, [{ status: 'succeeded', amount: 25, currency: 'INR' }]);
});

test('successful payment updates status and deducts stock inside the supplied transaction', async () => {
  const statements = [];
  const db = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.startsWith('SELECT id, status FROM orders')) return [[{ id: 21, status: 'pending' }]];
      if (sql.startsWith('SELECT book_id AS bookId')) return [[{ bookId: 3, quantity: 2 }]];
      if (sql.startsWith('UPDATE orders SET status')) return [{ affectedRows: 1 }];
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
  let deducted;
  const service = createOrdersService({
    pool: db,
    checkAvailability: async () => ({ ok: true, shortages: [] }),
    withTransaction: (_pool, work) => work(db),
    deductStock: async (connection, items) => {
      assert.equal(connection, db);
      deducted = items;
    },
  });

  const result = await service.recordPaymentStatus({
    orderId: 21, customerId: 8, paymentId: 15, paymentStatus: 'succeeded',
    paymentUpdate: async connection => { assert.equal(connection, db); return { status: 'succeeded' }; },
  });

  assert.deepEqual(result, { orderId: 21, status: 'paid', paymentAttempt: { status: 'succeeded' } });
  assert.deepEqual(deducted, [{ bookId: 3, quantity: 2 }]);
  assert.ok(statements.some(statement => statement.sql.startsWith('INSERT INTO order_status_history') && statement.params[1] === 'pending' && statement.params[2] === 'paid'));
});
