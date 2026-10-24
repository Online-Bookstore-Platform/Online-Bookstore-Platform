import { randomUUID } from 'node:crypto';
import { sum, lineTotal } from '../../uditi/shared/money.js';
import { deductStock as deductOrderStock } from '../../uditi/inventory/inventory.service.js';
import { withTransaction as runTransaction } from '../../uditi/shared/transaction.js';
import { HttpError, notFound } from '../shared/errors.js';
import { parseDeliveryDetails } from '../../uditi/checkout/checkout.validation.js';
import * as repository from './orders.repository.js';

function validateSavedDelivery(delivery) {
  if (!delivery) {
    throw new HttpError(400, 'DELIVERY_REQUIRED', 'Add valid delivery details before placing your order.', [
      { field: 'delivery', message: 'Save delivery details in checkout first.' },
    ]);
  }
  try {
    return parseDeliveryDetails(delivery);
  } catch (error) {
    if (error?.status !== 400) throw error;
    throw new HttpError(error.status, error.code, error.message, error.details);
  }
}

async function getOrderDetails(db, userId, orderId) {
  const order = await repository.findOrder(db, userId, orderId);
  if (!order) throw notFound('We could not find that order.', 'ORDER_NOT_FOUND');
  const [items, statusHistory] = await Promise.all([
    repository.listOrderItems(db, order.id),
    repository.listStatusHistory(db, order.id),
  ]);
  return {
    ...order,
    items: items.map(item => ({ ...item, lineTotal: lineTotal(item.unitPrice, item.quantity) })),
    statusHistory,
  };
}

export function createOrdersService({ pool, checkAvailability, withTransaction, deductStock = deductOrderStock }) {
  return {
    async createDraft(userId, requestedDelivery, idempotencyKey) {
      try {
        return await withTransaction(pool, async connection => {
          if (idempotencyKey) {
            const existing = await repository.findOrderByIdempotencyKey(connection, userId, idempotencyKey, { lock: true });
            if (existing) return getOrderDetails(connection, userId, existing.id);
          }

          const cartId = await repository.getCartId(connection, userId);
          if (!cartId) throw new HttpError(409, 'EMPTY_CART', 'Add at least one book to your cart before placing an order.');
          if (idempotencyKey) {
            const existing = await repository.findOrderByIdempotencyKey(connection, userId, idempotencyKey, { lock: true });
            if (existing) return getOrderDetails(connection, userId, existing.id);
          }
          const items = await repository.getCartItemsForOrder(connection, cartId);
          if (!items.length) throw new HttpError(409, 'EMPTY_CART', 'Add at least one book to your cart before placing an order.');

          const delivery = validateSavedDelivery(requestedDelivery ?? await repository.getSavedDelivery(connection, userId));
          const availability = await checkAvailability(connection, items.map(({ bookId, quantity }) => ({ bookId, quantity })));
          if (!availability.ok) {
            throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Some books in your cart are no longer available in the selected quantity.', availability.shortages);
          }

          const totalAmount = sum(items.map(item => lineTotal(item.unitPrice, item.quantity)));
          const orderId = await repository.createOrder(connection, {
            orderNumber: randomUUID().replaceAll('-', ''),
            userId,
            totalAmount,
            delivery,
            idempotencyKey,
          });
          for (const item of items) await repository.createOrderItem(connection, orderId, item);
          await repository.createInitialStatus(connection, orderId, userId);
          await repository.clearCart(connection, cartId);

          return getOrderDetails(connection, userId, orderId);
        });
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY' && idempotencyKey) {
          const existing = await repository.findOrderByIdempotencyKey(pool, userId, idempotencyKey);
          if (existing) return getOrderDetails(pool, userId, existing.id);
        }
        throw error;
      }
    },

    async list(userId) {
      return repository.listOrders(pool, userId);
    },

    get(userId, orderId) {
      return getOrderDetails(pool, userId, orderId);
    },

    async tracking(userId, orderId) {
      const order = await repository.findOrder(pool, userId, orderId);
      if (!order) throw notFound('We could not find that order.', 'ORDER_NOT_FOUND');
      return { order, statusHistory: await repository.listStatusHistory(pool, order.id) };
    },

    getPayableOrder(orderId, customerId) {
      return repository.getPayableOrder(pool, orderId, customerId);
    },

    async recordPaymentStatus({ orderId, customerId, paymentId, paymentStatus }) {
      const nextStatus = paymentStatus === 'succeeded' ? 'paid' : 'payment_failed';
      if (!['pending', 'succeeded', 'failed', 'cancelled', 'timed_out'].includes(paymentStatus)) {
        throw new HttpError(400, 'INVALID_PAYMENT_STATUS', 'The payment status is not supported.');
      }
      if (paymentStatus === 'pending') return;

      return withTransaction(pool, async connection => {
        const order = await repository.findOrderForUpdate(connection, customerId, orderId);
        if (!order) throw notFound('We could not find that order.', 'ORDER_NOT_FOUND');

        if (order.status === 'paid' && paymentStatus === 'succeeded') return;
        if (order.status === 'payment_failed' && paymentStatus !== 'succeeded') return;
        if (!['pending', 'payment_failed'].includes(order.status)) {
          throw new HttpError(409, 'ORDER_NOT_PAYABLE', 'This order can no longer receive a payment status update.');
        }

        if (paymentStatus === 'succeeded') {
          const items = await repository.listOrderStockItems(connection, order.id);
          if (!items.length) throw new HttpError(409, 'EMPTY_ORDER', 'This order has no items to fulfill.');
          await deductStock(connection, items);
        }
        if (!await repository.changeOrderStatus(connection, order.id, order.status, nextStatus)) {
          throw new HttpError(409, 'ORDER_STATUS_CHANGED', 'The order status changed while the payment was being recorded.');
        }
        await repository.addStatusHistory(connection, {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: nextStatus,
          note: paymentStatus === 'succeeded'
            ? `Payment ${paymentId} confirmed.`
            : `Payment ${paymentId} ${paymentStatus}.`,
        });
        return { orderId: order.id, status: nextStatus };
      });
    },
  };
}

export function createVrindaOrderService({ pool, withTransaction = runTransaction, deductStock = deductOrderStock }) {
  const orders = createOrdersService({ pool, withTransaction, deductStock });
  return {
    getPayableOrder(orderId, customerId) {
      return orders.getPayableOrder(orderId, customerId);
    },
    recordPaymentStatus({ orderId, customerId, paymentId, paymentStatus }) {
      return orders.recordPaymentStatus({
        orderId,
        customerId,
        paymentId,
        paymentStatus,
      });
    },
  };
}
