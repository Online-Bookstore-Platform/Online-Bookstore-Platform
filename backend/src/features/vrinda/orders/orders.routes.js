import { Router } from 'express';
import { asyncHandler, badRequest, HttpError } from '../shared/errors.js';
import { parseIdempotencyKey, parseOrderDraft, parsePaymentMethod } from './orders.validation.js';
import { createOrdersService } from './orders.service.js';
import { restoreStock } from '../../uditi/inventory/inventory.service.js';

function parseOrderId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,17}$/.test(value)) {
    throw badRequest('Choose a valid order.', [{ field: 'orderId', message: 'The order identifier is invalid.' }]);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw badRequest('Choose a valid order.', [{ field: 'orderId', message: 'The order identifier is too large.' }]);
  return id;
}

export function createOrdersRouter({ pool, requireAuth, checkAvailability, withTransaction, deductStock, cancellationEmails, logger = console }) {
  const router = Router();
  const orders = createOrdersService({ pool, checkAvailability, withTransaction, deductStock });

  const createDraft = asyncHandler(async (request, response) => {
    const delivery = parseOrderDraft(request.body);
    const paymentMethod = parsePaymentMethod(request.body?.paymentMethod);
    if (paymentMethod !== 'cod') throw new HttpError(409, 'PAYMENT_OTP_REQUIRED', 'Online orders are created only after the payment email code is verified.');
    const idempotencyKey = parseIdempotencyKey(request.get('Idempotency-Key'));
    const order = await orders.createDraft(request.user.id, delivery, idempotencyKey, paymentMethod);
    response.status(201).json({ order });
  });

  router.post('/draft', requireAuth, createDraft);
  router.post('/', requireAuth, createDraft);

  router.get('/', requireAuth, asyncHandler(async (request, response) => {
    response.json({ orders: await orders.list(request.user.id) });
  }));

  router.get('/:orderId/tracking', requireAuth, asyncHandler(async (request, response) => {
    response.json({ tracking: await orders.tracking(request.user.id, parseOrderId(request.params.orderId)) });
  }));

  router.post('/:orderId/return', requireAuth, asyncHandler(async (request, response) => {
    const orderId = parseOrderId(request.params.orderId);
    const result = await withTransaction(pool, async connection => {
      const [rows] = await connection.query('SELECT id, status FROM orders WHERE id = ? AND user_id = ? FOR UPDATE', [orderId, request.user.id]);
      if (!rows[0]) throw new HttpError(404, 'ORDER_NOT_FOUND', 'We could not find that order.');
      if (rows[0].status !== 'delivered') throw new HttpError(409, 'RETURN_NOT_ALLOWED', 'A return can only be requested for a delivered order.');
      await connection.query("UPDATE orders SET status = 'return_requested' WHERE id = ?", [orderId]);
      await connection.query("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note) VALUES (?, 'delivered', 'return_requested', ?, 'Customer requested a return.')", [orderId, request.user.id]);
      return { id: orderId, status: 'return_requested' };
    });
    response.json({ order: result });
  }));

  router.post('/:orderId/cancel', requireAuth, asyncHandler(async (request, response) => {
    const orderId = parseOrderId(request.params.orderId);
    const result = await withTransaction(pool, async connection => {
      const [rows] = await connection.query('SELECT id, status, payment_status AS paymentStatus, stock_reserved AS stockReserved FROM orders WHERE id = ? AND user_id = ? FOR UPDATE', [orderId, request.user.id]);
      const order = rows[0];
      if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'We could not find that order.');
      if (!['pending', 'pending_collection', 'paid', 'confirmed', 'processing', 'packed'].includes(order.status)) throw new HttpError(409, 'ORDER_NOT_CANCELLABLE', 'This order can only be cancelled before it has shipped.');
      if (order.stockReserved) {
        const [items] = await connection.query('SELECT book_id AS bookId, quantity FROM order_items WHERE order_id = ? ORDER BY book_id', [order.id]);
        await restoreStock(connection, items);
        await connection.query('UPDATE orders SET stock_reserved = 0 WHERE id = ?', [order.id]);
      }
      await connection.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
      await connection.query('INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note) VALUES (?, ?, \'cancelled\', ?, \'Customer cancelled before fulfilment.\')', [order.id, order.status, request.user.id]);
      await connection.query('INSERT IGNORE INTO order_cancellation_email_deliveries (order_id) VALUES (?)', [order.id]);
      return { id: order.id, status: 'cancelled' };
    });
    try {
      const cancelledOrder = await orders.get(request.user.id, result.id);
      await cancellationEmails?.sendForOrder(cancelledOrder);
    } catch (error) {
      // Cancellation is already committed; notification failures must not affect its response.
      logger?.error?.('[email] Could not prepare order cancellation notification', { category: 'ORDER_CANCELLATION_EMAIL_PREPARATION_FAILED', orderId: result.id, code: error?.code });
    }
    response.json({ order: result });
  }));

  router.get('/:orderId', requireAuth, asyncHandler(async (request, response) => {
    response.json({ order: await orders.get(request.user.id, parseOrderId(request.params.orderId)) });
  }));

  return router;
}
