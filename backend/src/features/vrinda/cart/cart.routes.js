import { Router } from 'express';
import { withTransaction } from '../../uditi/shared/transaction.js';
import { asyncHandler } from '../shared/errors.js';
import { parseCartItem, parseItemId, parseQuantity } from './cart.validation.js';
import { createCartService } from './cart.service.js';

export function createCartRouter({ pool, requireAuth }) {
  const router = Router();
  const cart = createCartService({ pool, withTransaction });

  router.get('/', requireAuth, asyncHandler(async (request, response) => {
    response.json({ cart: await cart.get(request.user.id) });
  }));

  router.post('/items', requireAuth, asyncHandler(async (request, response) => {
    const result = await cart.add(request.user.id, parseCartItem(request.body));
    response.status(201).json({ cart: result });
  }));

  router.patch('/items/:itemId', requireAuth, asyncHandler(async (request, response) => {
    const bookId = parseItemId(request.params.itemId);
    const quantity = parseQuantity(request.body);
    response.json({ cart: await cart.update(request.user.id, bookId, quantity) });
  }));

  router.delete('/items/:itemId', requireAuth, asyncHandler(async (request, response) => {
    const bookId = parseItemId(request.params.itemId);
    response.json({ cart: await cart.remove(request.user.id, bookId) });
  }));

  return router;
}
