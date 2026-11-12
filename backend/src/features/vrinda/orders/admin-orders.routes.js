import { Router } from 'express';
import { asyncHandler, badRequest, notFound, HttpError } from '../shared/errors.js';
import { withTransaction } from '../../uditi/shared/transaction.js';
import { restoreStock } from '../../uditi/inventory/inventory.service.js';

const NEXT = { pending_collection: 'confirmed', pending: 'confirmed', paid: 'confirmed', confirmed: 'processing', processing: 'packed', packed: 'shipped', shipped: 'out_for_delivery', out_for_delivery: 'delivered', return_requested: 'returned' };
const ALLOWED_TRANSITIONS = {
  ...Object.fromEntries(Object.entries(NEXT).map(([from, to]) => [from, [to]])),
  processing: ['packed', 'shipped'],
  shipped: ['out_for_delivery', 'delivered'],
};
const idPattern = /^[1-9]\d{0,17}$/;

export function createAdminOrdersRouter({ pool, requireAdmin }) {
  const router = Router();
  router.use(...(Array.isArray(requireAdmin) ? requireAdmin : [requireAdmin]));
  router.get('/', asyncHandler(async (_request, response) => {
    const [orders] = await pool.query(`SELECT orders.id, orders.order_number AS orderNumber, orders.user_id AS userId, orders.status,
      orders.payment_method AS paymentMethod, orders.payment_status AS paymentStatus, orders.total_amount AS totalAmount,
      orders.currency, orders.created_at AS createdAt, users.name AS customerName, users.email AS customerEmail
      FROM orders JOIN users ON users.id = orders.user_id ORDER BY orders.created_at DESC, orders.id DESC`);
    const [items] = orders.length
      ? await pool.query(`SELECT order_id AS orderId, book_id AS bookId, book_title AS title, quantity, unit_price AS unitPrice
        FROM order_items WHERE order_id IN (${orders.map(() => '?').join(',')}) ORDER BY order_id, id`, orders.map(order => order.id))
      : [[]];
    const itemsByOrder = new Map();
    for (const item of items) {
      const orderItems = itemsByOrder.get(item.orderId) ?? [];
      orderItems.push(item);
      itemsByOrder.set(item.orderId, orderItems);
    }
    for (const order of orders) order.items = itemsByOrder.get(order.id) ?? [];
    response.json({ orders });
  }));
  router.get('/:orderId', asyncHandler(async (request, response) => {
    if (!idPattern.test(request.params.orderId)) throw badRequest('Choose a valid order.');
    const [rows] = await pool.query('SELECT orders.*, users.name AS customerName, users.email AS customerEmail FROM orders JOIN users ON users.id = orders.user_id WHERE orders.id = ? LIMIT 1', [request.params.orderId]);
    if (!rows[0]) throw notFound('Order not found.', 'ORDER_NOT_FOUND');
    const [items] = await pool.query('SELECT book_id AS bookId, book_title AS title, quantity, unit_price AS unitPrice FROM order_items WHERE order_id = ? ORDER BY id', [request.params.orderId]);
    const [history] = await pool.query('SELECT from_status AS fromStatus, to_status AS toStatus, changed_by AS changedBy, note, created_at AS createdAt FROM order_status_history WHERE order_id = ? ORDER BY id', [request.params.orderId]);
    response.json({ order: { ...rows[0], items, history } });
  }));
  router.patch('/:orderId/status', asyncHandler(async (request, response) => {
    if (!idPattern.test(request.params.orderId)) throw badRequest('Choose a valid order.');
    const { status, note } = request.body ?? {};
    if (!['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].includes(status)) throw badRequest('Choose a supported fulfilment status.');
    const result = await withTransaction(pool, async connection => {
      const [rows] = await connection.query('SELECT id, status, payment_method AS paymentMethod, payment_status AS paymentStatus, stock_reserved AS stockReserved FROM orders WHERE id = ? FOR UPDATE', [request.params.orderId]);
      const order = rows[0];
      if (!order) throw notFound('Order not found.', 'ORDER_NOT_FOUND');
      const expected = ALLOWED_TRANSITIONS[order.status];
      if (status === 'cancelled') {
        if (!['pending', 'pending_collection', 'confirmed', 'processing', 'packed'].includes(order.status) || (order.paymentMethod !== 'cod' && order.paymentStatus === 'succeeded')) throw new HttpError(409, 'ORDER_NOT_CANCELLABLE', 'This order cannot be cancelled in its current state.');
        if (order.stockReserved) {
          const [items] = await connection.query('SELECT book_id AS bookId, quantity FROM order_items WHERE order_id = ? ORDER BY book_id', [order.id]);
          await restoreStock(connection, items);
          await connection.query('UPDATE orders SET stock_reserved = 0 WHERE id = ?', [order.id]);
        }
        await connection.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
      } else {
        if (!expected?.includes(status)) throw new HttpError(409, 'INVALID_ORDER_TRANSITION', `Order status ${order.status} can only move to ${expected?.join(' or ') || 'a terminal state'}.`);
        if (status === 'confirmed' && order.paymentMethod !== 'cod' && order.paymentStatus !== 'succeeded') throw new HttpError(409, 'PAYMENT_REQUIRED', 'Online payment must be verified before confirming the order.');
        await connection.query('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
      }
      await connection.query('INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)', [order.id, order.status, status, request.user.id, typeof note === 'string' ? note.slice(0, 255) : null]);
      return { id: order.id, status };
    });
    response.json({ order: result });
  }));
  router.patch('/:orderId/payment', asyncHandler(async (request, response) => {
    if (!idPattern.test(request.params.orderId)) throw badRequest('Choose a valid order.');
    if (request.body?.status !== 'collected') throw badRequest('Payment collection can only be marked collected.');
    const payment = await withTransaction(pool, async connection => {
      const [rows] = await connection.query('SELECT id, status, payment_method AS paymentMethod, payment_status AS paymentStatus FROM orders WHERE id = ? FOR UPDATE', [request.params.orderId]);
      const order = rows[0];
      if (!order) throw notFound('Order not found.', 'ORDER_NOT_FOUND');
      if (order.paymentStatus === 'collected' && order.paymentMethod === 'cod') return { paymentStatus: 'collected', reused: true };
      if (order.paymentMethod !== 'cod' || order.status !== 'delivered' || order.paymentStatus !== 'pending_collection') throw new HttpError(409, 'COLLECTION_NOT_ALLOWED', 'Only delivered COD orders awaiting collection can be marked collected.');
      await connection.query("UPDATE orders SET payment_status = 'collected' WHERE id = ?", [order.id]);
      await connection.query("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note) VALUES (?, 'delivered', 'delivered', ?, 'Cash on delivery was collected.')", [order.id, request.user.id]);
      return { paymentStatus: 'collected', reused: false };
    });
    response.json(payment);
  }));
  return router;
}
