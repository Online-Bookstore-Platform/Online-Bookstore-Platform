import { randomUUID } from 'node:crypto';
import { sum, lineTotal } from '../../uditi/shared/money.js';
import { deductStock as deductOrderStock, restoreStock } from '../../uditi/inventory/inventory.service.js';
import { checkAvailability as checkOrderAvailability } from '../../uditi/inventory/inventory.service.js';
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
  const [items, statusHistory, paymentAttempts] = await Promise.all([
    repository.listOrderItems(db, order.id),
    repository.listStatusHistory(db, order.id),
    repository.listPaymentAttempts(db, order.id),
  ]);
  return {
    ...order,
    items: items.map(item => ({ ...item, lineTotal: lineTotal(item.unitPrice, item.quantity) })),
    subtotalAmount: items.reduce((total, item) => total + lineTotal(item.unitPrice, item.quantity), 0),
    deliveryCharge: 0,
    statusHistory,
    paymentAttempts,
  };
}

async function createOrderInTransaction({ connection, userId, requestedDelivery, idempotencyKey, paymentMethod, checkAvailability, deductStock, simulatedPayment = null }) {
  const cartId = await repository.getCartId(connection, userId);
  if (!cartId) throw new HttpError(409, 'EMPTY_CART', 'Add at least one book to your cart before placing your order.');
  const items = await repository.getCartItemsForOrder(connection, cartId);
  if (!items.length) throw new HttpError(409, 'EMPTY_CART', 'Add at least one book to your cart before placing your order.');

  const delivery = validateSavedDelivery(requestedDelivery ?? await repository.getSavedDelivery(connection, userId));
  const availability = await checkAvailability(connection, items.map(({ bookId, quantity }) => ({ bookId, quantity })));
  if (!availability.ok) {
    throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Some books in your cart are no longer available in the selected quantity.', availability.shortages);
  }

  const totalAmount = sum(items.map(item => lineTotal(item.unitPrice, item.quantity)));
  const orderId = await repository.createOrder(connection, {
    orderNumber: randomUUID().replaceAll('-', ''), userId, totalAmount,
    delivery, idempotencyKey, paymentMethod,
  });
  for (const item of items) await repository.createOrderItem(connection, orderId, item);

  if (paymentMethod === 'cod') {
    await deductStock(connection, items.map(({ bookId, quantity }) => ({ bookId, quantity })));
    await repository.setStockReserved(connection, orderId, true);
    await repository.setCodPaymentDue(connection, orderId, userId);
  } else {
    await repository.createInitialStatus(connection, orderId, userId);
    if (simulatedPayment) {
      await deductStock(connection, items.map(({ bookId, quantity }) => ({ bookId, quantity })));
      if (!await repository.changeOrderStatus(connection, orderId, 'pending', 'confirmed')) {
        throw new HttpError(409, 'ORDER_STATUS_CHANGED', 'The order changed while payment was being confirmed.');
      }
      await repository.setPaymentStatus(connection, orderId, 'succeeded');
      await repository.addStatusHistory(connection, {
        orderId, fromStatus: 'pending', toStatus: 'confirmed',
        note: 'Payment verified by email and order confirmed.',
      });
      await simulatedPayment.recordPayment(connection, {
        challengeId: simulatedPayment.challengeId,
        orderId,
        userId,
        amount: totalAmount,
        currency: 'INR',
      });
    }
  }

  await repository.clearCart(connection, cartId);
  return getOrderDetails(connection, userId, orderId);
}

export function createOrdersService({ pool, checkAvailability, withTransaction, deductStock = deductOrderStock }) {
  return {
    async validatePaymentCheckout(userId) {
      return withTransaction(pool, async connection => {
        const cartId = await repository.getCartId(connection, userId);
        if (!cartId) throw new HttpError(409, 'EMPTY_CART', 'Add at least one book to your cart before placing your order.');
        const items = await repository.getCartItemsForOrder(connection, cartId);
        if (!items.length) throw new HttpError(409, 'EMPTY_CART', 'Add at least one book to your cart before placing your order.');
        validateSavedDelivery(await repository.getSavedDelivery(connection, userId));
        const availability = await checkAvailability(connection, items.map(({ bookId, quantity }) => ({ bookId, quantity })));
        if (!availability.ok) throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Some books in your cart are no longer available in the selected quantity.', availability.shortages);
        return { totalAmount: sum(items.map(item => lineTotal(item.unitPrice, item.quantity))), itemCount: items.reduce((total, item) => total + Number(item.quantity), 0) };
      });
    },

    async createDraft(userId, requestedDelivery, idempotencyKey, paymentMethod = 'card') {
      try {
        return await withTransaction(pool, async connection => {
          if (idempotencyKey) {
            const existing = await repository.findOrderByIdempotencyKey(connection, userId, idempotencyKey, { lock: true });
            if (existing) return getOrderDetails(connection, userId, existing.id);
          }

          if (idempotencyKey) {
            const existing = await repository.findOrderByIdempotencyKey(connection, userId, idempotencyKey, { lock: true });
            if (existing) return getOrderDetails(connection, userId, existing.id);
          }
          return createOrderInTransaction({ connection, userId, requestedDelivery, idempotencyKey, paymentMethod, checkAvailability, deductStock });
        });
        await repository.ensureOrderConfirmationDelivery(connection, orderId);
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY' && idempotencyKey) {
          const existing = await repository.findOrderByIdempotencyKey(pool, userId, idempotencyKey);
          if (existing) return getOrderDetails(pool, userId, existing.id);
        }
        throw error;
      }
    },

    async createAfterPaymentOtp({ userId, challengeId, verifyChallenge, recordPayment }) {
      const idempotencyKey = `payment-otp-${challengeId}`;
      return withTransaction(pool, async connection => {
        const existing = await repository.findOrderByIdempotencyKey(connection, userId, idempotencyKey, { lock: true });
        if (existing) {
          await repository.ensureOrderConfirmationDelivery(connection, existing.id);
          return { order: await getOrderDetails(connection, userId, existing.id), reused: true };
        }

        const verification = await verifyChallenge(connection);
        if (!verification.ok) {
          if (verification.reason === 'used') {
            const completed = await repository.findOrderByIdempotencyKey(connection, userId, idempotencyKey, { lock: true });
            if (completed) return { order: await getOrderDetails(connection, userId, completed.id), reused: true };
          }
          return { verification };
        }

        const order = await createOrderInTransaction({
          connection, userId, requestedDelivery: null, idempotencyKey,
          paymentMethod: verification.paymentMethod, checkAvailability, deductStock,
          simulatedPayment: { challengeId, recordPayment },
        });
        await repository.ensureOrderConfirmationDelivery(connection, order.id);
        return { order, reused: false };
      });
    },

    async list(userId) {
      return repository.listOrders(pool, userId);
    },

    get(userId, orderId) {
      return getOrderDetails(pool, userId, orderId);
    },

    async tracking(userId, orderId) {
      const order = await getOrderDetails(pool, userId, orderId);
      return { order, statusHistory: order.statusHistory };
    },

    getPayableOrder(orderId, customerId) {
      return repository.getPayableOrder(pool, orderId, customerId);
    },

    async reserveStock(orderId, customerId) {
      return withTransaction(pool, async connection => {
        const order = await repository.findOrderForUpdate(connection, customerId, orderId);
        if (!order) throw notFound('The order could not be found for this customer.', 'ORDER_NOT_FOUND');
        if (order.stockReserved) return;
        const items = await repository.listOrderStockItems(connection, order.id);
        if (!items.length) throw new HttpError(409, 'EMPTY_ORDER', 'This order has no items to fulfill.');
        await deductStock(connection, items);
        await repository.setStockReserved(connection, order.id, true);
      });
    },

    async recordPaymentStatus({ orderId, customerId, paymentId, paymentStatus, paymentUpdate }) {
      if (!['pending', 'succeeded', 'failed', 'cancelled', 'timed_out'].includes(paymentStatus)) {
        throw new HttpError(400, 'INVALID_PAYMENT_STATUS', 'The payment status is not supported.');
      }
      if (paymentStatus === 'pending') return paymentUpdate ? { paymentAttempt: await paymentUpdate(pool) } : undefined;

      return withTransaction(pool, async connection => {
        const order = await repository.findOrderForUpdate(connection, customerId, orderId);
        if (!order) throw notFound('We could not find that order.', 'ORDER_NOT_FOUND');
        const updateAttempt = async () => {
          const paymentAttempt = paymentUpdate ? await paymentUpdate(connection) : null;
          if (paymentAttempt && paymentAttempt.status !== paymentStatus) throw new HttpError(409, 'PAYMENT_ATTEMPT_CHANGED', 'This payment attempt has already been processed.');
          return paymentAttempt;
        };

        if (order.status === 'confirmed' && paymentStatus === 'succeeded') return paymentUpdate ? { paymentAttempt: await updateAttempt() } : undefined;
        if (!['pending', 'payment_failed'].includes(order.status)) {
          throw new HttpError(409, 'ORDER_NOT_PAYABLE', 'This order can no longer receive a payment status update.');
        }

        if (paymentStatus === 'succeeded' && !order.stockReserved) {
          const items = await repository.listOrderStockItems(connection, order.id);
          if (!items.length) throw new HttpError(409, 'EMPTY_ORDER', 'This order has no items to fulfill.');
          await deductStock(connection, items);
        }
        if (paymentStatus !== 'succeeded' && order.stockReserved) {
          await restoreStock(connection, await repository.listOrderStockItems(connection, order.id));
        }
        if (order.stockReserved) await repository.setStockReserved(connection, order.id, false);
        const nextStatus = paymentStatus === 'succeeded' ? 'confirmed' : order.status;
        if (nextStatus !== order.status && !await repository.changeOrderStatus(connection, order.id, order.status, nextStatus)) {
          throw new HttpError(409, 'ORDER_STATUS_CHANGED', 'The order status changed while the payment was being recorded.');
        }
        await repository.setPaymentStatus(connection, order.id, paymentStatus === 'succeeded' ? 'succeeded' : 'failed');
        await repository.addStatusHistory(connection, {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: nextStatus,
          note: paymentStatus === 'succeeded'
            ? 'Payment was verified and the order was confirmed.'
            : `Payment attempt ended (${paymentStatus}); order remains awaiting payment.`,
        });
        const paymentAttempt = paymentUpdate ? await updateAttempt() : null;
        return { orderId: order.id, status: nextStatus, ...(paymentUpdate ? { paymentAttempt } : {}) };
      });
    },
  };
}

export function createVrindaOrderService({ pool, checkAvailability = checkOrderAvailability, withTransaction = runTransaction, deductStock = deductOrderStock }) {
  const orders = createOrdersService({ pool, checkAvailability, withTransaction, deductStock });
  return {
    validatePaymentCheckout(userId) {
      return orders.validatePaymentCheckout(userId);
    },
    createAfterPaymentOtp(input) {
      return orders.createAfterPaymentOtp(input);
    },
    getPayableOrder(orderId, customerId) {
      return orders.getPayableOrder(orderId, customerId);
    },
    reserveStock(orderId, customerId) {
      return orders.reserveStock(orderId, customerId);
    },
    recordPaymentStatus({ orderId, customerId, paymentId, paymentStatus, paymentUpdate }) {
      return orders.recordPaymentStatus({
        orderId,
        customerId,
        paymentId,
        paymentStatus,
        paymentUpdate,
      });
    },
  };
}
