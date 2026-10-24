import { Router } from 'express';
import { asyncHandler, badRequest } from '../shared/errors.js';
import { parseIdempotencyKey, parseOrderDraft } from './orders.validation.js';
import { createOrdersService } from './orders.service.js';

function parseOrderId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,17}$/.test(value)) {
    throw badRequest('Choose a valid order.', [{ field: 'orderId', message: 'The order identifier is invalid.' }]);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw badRequest('Choose a valid order.', [{ field: 'orderId', message: 'The order identifier is too large.' }]);
  return id;
}

export function createOrdersRouter({ pool, requireAuth, checkAvailability, withTransaction, deductStock }) {
  const router = Router();
  const orders = createOrdersService({ pool, checkAvailability, withTransaction, deductStock });

  const createDraft = asyncHandler(async (request, response) => {
    const delivery = parseOrderDraft(request.body);
    const idempotencyKey = parseIdempotencyKey(request.get('Idempotency-Key'));
    const order = await orders.createDraft(request.user.id, delivery, idempotencyKey);
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

  router.get('/:orderId', requireAuth, asyncHandler(async (request, response) => {
    response.json({ order: await orders.get(request.user.id, parseOrderId(request.params.orderId)) });
  }));

  return router;
}
