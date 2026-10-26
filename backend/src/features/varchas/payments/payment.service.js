import { HttpError } from '../errors.js';

const validStatuses = new Set(['pending', 'succeeded', 'failed', 'cancelled', 'timed_out']);

async function persistOutcome({ orders, payments, paymentId, orderId, customerId, status, reference }) {
  const transition = await orders.recordPaymentStatus({
    orderId,
    customerId,
    paymentId,
    paymentStatus: status,
    paymentUpdate: connection => payments.updateStatus(paymentId, status, reference, connection),
  });
  if (transition?.paymentAttempt) return transition.paymentAttempt;
  // Adapters predating the shared transaction callback still get the same status update.
  return payments.updateStatus(paymentId, status, reference);
}

export function createPaymentService({ orders, payments, provider }) {
  return {
    async process({ orderId, customerId, idempotencyKey }) {
      const existing = await payments.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (String(existing.orderId) !== String(orderId) || String(existing.customerId) !== String(customerId)) throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED', 'This request key belongs to a different payment.');
        return { attempt: existing, reused: true };
      }

      const order = await orders.getPayableOrder(orderId, customerId);
      if (!order || String(order.customerId) !== String(customerId)) throw new HttpError(404, 'ORDER_NOT_FOUND', 'The order could not be found for this customer.');
      if (!Number.isFinite(Number(order.amount)) || Number(order.amount) <= 0) throw new HttpError(409, 'INVALID_ORDER_AMOUNT', 'This order cannot be paid with its current amount.');
      if (!['pending', 'payment_due', 'payment_failed'].includes(order.status)) throw new HttpError(409, 'ORDER_NOT_PAYABLE', 'This order is not awaiting payment.');

      // The repository must enforce a unique key atomically across processes.
      let attempt;
      try {
        attempt = await payments.createPending({ idempotencyKey, orderId, customerId, amount: Number(order.amount), currency: order.currency || 'INR' });
      } catch (error) {
        if (!['ER_DUP_ENTRY', 'DUPLICATE_IDEMPOTENCY_KEY', 'IDEMPOTENCY_CONFLICT'].includes(error.code)) throw error;
        const concurrent = await payments.findByIdempotencyKey(idempotencyKey);
        if (!concurrent || String(concurrent.orderId) !== String(orderId) || String(concurrent.customerId) !== String(customerId)) throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED', 'This request key belongs to a different payment.');
        return { attempt: concurrent, reused: true };
      }
      let result;
      try {
        result = await provider.process({ paymentId: attempt.id, orderId, amount: Number(order.amount), currency: order.currency || 'INR' });
      } catch (error) {
        result = { status: error.code === 'PAYMENT_TIMEOUT' ? 'timed_out' : 'failed', providerReference: null };
      }
      if (!validStatuses.has(result.status)) throw new HttpError(502, 'INVALID_PROVIDER_RESULT', 'The payment provider returned an invalid result.');
      const updated = await persistOutcome({ orders, payments, paymentId: attempt.id, orderId, customerId, status: result.status, reference: result.providerReference ?? null });
      return { attempt: updated, reused: false };
    },

    async getStatus(paymentId, customerId) {
      const attempt = await payments.findById(paymentId);
      if (!attempt || String(attempt.customerId) !== String(customerId)) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'The payment could not be found.');
      return attempt;
    },

    async cancel(paymentId, customerId) {
      const attempt = await payments.findById(paymentId);
      if (!attempt || String(attempt.customerId) !== String(customerId)) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'The payment could not be found.');
      if (attempt.status !== 'pending') return attempt;
      const result = provider.cancel ? await provider.cancel({ paymentId: attempt.id }) : { status: 'cancelled' };
      if (!validStatuses.has(result.status)) throw new HttpError(502, 'INVALID_PROVIDER_RESULT', 'The payment provider returned an invalid result.');
      const updated = await persistOutcome({ orders, payments, paymentId: attempt.id, orderId: attempt.orderId, customerId, status: result.status, reference: result.providerReference ?? null });
      return updated;
    },
  };
}
