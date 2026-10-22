import { HttpError } from '../errors.js';

const validStatuses = new Set(['pending', 'succeeded', 'failed', 'cancelled', 'timed_out']);

export function createPaymentService({ orders, payments, provider }) {
  return {
    async process({ orderId, customerId, idempotencyKey }) {
      const existing = await payments.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (String(existing.orderId) !== String(orderId) || String(existing.customerId) !== String(customerId)) throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED', 'This request key belongs to a different payment.');
        if (existing.status === 'pending' && provider.verify) {
          let verified;
          try { verified = await provider.verify({ paymentId: existing.id, orderId: existing.orderId }); }
          catch { return { attempt: existing, reused: true, providerMode: provider.mode }; }
          if (verified && verified.status !== 'pending' && validStatuses.has(verified.status)) {
            const updated = await payments.updateStatus(existing.id, verified.status, verified.providerReference ?? null);
            await orders.recordPaymentStatus({ orderId: existing.orderId, customerId, paymentId: existing.id, paymentStatus: updated.status });
            return { attempt: updated, reused: true, providerMode: provider.mode };
          }
        }
        return { attempt: existing, reused: true, providerMode: provider.mode };
      }

      const order = await orders.getPayableOrder(orderId, customerId);
      if (!order || String(order.customerId) !== String(customerId)) throw new HttpError(404, 'ORDER_NOT_FOUND', 'The order could not be found for this customer.');
      if (!Number.isFinite(Number(order.amount)) || Number(order.amount) <= 0) throw new HttpError(409, 'INVALID_ORDER_AMOUNT', 'This order cannot be paid with its current amount.');
      if (!['pending', 'payment_due', 'payment_failed'].includes(order.status)) throw new HttpError(409, 'ORDER_NOT_PAYABLE', 'This order is not awaiting payment.');

      if (provider.mode === 'unconfigured') throw new HttpError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'No payment sandbox is configured.');

      // The repository must enforce a unique key atomically across processes.
      let attempt;
      try {
        attempt = await payments.createPending({ idempotencyKey, orderId, customerId, amount: Number(order.amount), currency: order.currency || 'INR' });
      } catch (error) {
        if (!['ER_DUP_ENTRY', 'DUPLICATE_IDEMPOTENCY_KEY', 'IDEMPOTENCY_CONFLICT'].includes(error.code)) throw error;
        const concurrent = await payments.findByIdempotencyKey(idempotencyKey);
        if (!concurrent || String(concurrent.orderId) !== String(orderId) || String(concurrent.customerId) !== String(customerId)) throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED', 'This request key belongs to a different payment.');
        return { attempt: concurrent, reused: true, providerMode: provider.mode };
      }
      let result;
      try {
        result = await provider.process({ paymentId: attempt.id, orderId, amount: Number(order.amount), currency: order.currency || 'INR' });
      } catch (error) {
        result = { status: error.code === 'PAYMENT_TIMEOUT' ? 'timed_out' : 'failed', providerReference: null };
      }
      if (!validStatuses.has(result.status)) throw new HttpError(502, 'INVALID_PROVIDER_RESULT', 'The payment provider returned an invalid result.');
      const updated = await payments.updateStatus(attempt.id, result.status, result.providerReference ?? null);
      await orders.recordPaymentStatus({ orderId, customerId, paymentId: attempt.id, paymentStatus: updated.status });
      return { attempt: updated, reused: false, providerMode: provider.mode };
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
      const updated = await payments.updateStatus(attempt.id, result.status, result.providerReference ?? null);
      await orders.recordPaymentStatus({ orderId: attempt.orderId, customerId, paymentId: attempt.id, paymentStatus: updated.status });
      return updated;
    },
  };
}
