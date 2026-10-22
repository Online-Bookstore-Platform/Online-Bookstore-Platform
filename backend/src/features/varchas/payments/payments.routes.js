import { Router } from 'express';
import { HttpError, asyncHandler } from '../errors.js';

export function createPaymentsRouter({ paymentService, requireAuth }) {
  const router = Router();
  router.use(...(Array.isArray(requireAuth) ? requireAuth : [requireAuth]));

  router.post('/orders/:orderId', asyncHandler(async (request, response) => {
    if (Object.keys(request.body ?? {}).length) throw new HttpError(400, 'PAYMENT_DATA_NOT_ACCEPTED', 'Send no card data. Payment details must be handled by a configured provider.');
    const orderId = request.params.orderId;
    if (!/^[\w-]{1,64}$/.test(orderId)) throw new HttpError(400, 'INVALID_ORDER_ID', 'The order identifier is invalid.');
    const idempotencyKey = request.get('Idempotency-Key');
    if (!idempotencyKey || idempotencyKey.length > 128) throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const result = await paymentService.process({ orderId, customerId: request.user.id, idempotencyKey });
    response.status(result.reused ? 200 : 201).json(result);
  }));

  router.get('/:paymentId', asyncHandler(async (request, response) => {
    if (!/^[\w-]{1,64}$/.test(request.params.paymentId)) throw new HttpError(400, 'INVALID_PAYMENT_ID', 'The payment identifier is invalid.');
    response.json({ attempt: await paymentService.getStatus(request.params.paymentId, request.user.id) });
  }));

  router.post('/:paymentId/cancel', asyncHandler(async (request, response) => {
    if (!/^[\w-]{1,64}$/.test(request.params.paymentId)) throw new HttpError(400, 'INVALID_PAYMENT_ID', 'The payment identifier is invalid.');
    response.json({ attempt: await paymentService.cancel(request.params.paymentId, request.user.id) });
  }));
  return router;
}
