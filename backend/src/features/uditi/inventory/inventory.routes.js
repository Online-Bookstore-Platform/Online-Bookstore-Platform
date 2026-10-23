import { Router } from 'express';
import { asyncHandler, notFound } from '../shared/errors.js';
import * as inventory from './inventory.repository.js';
import * as service from './inventory.service.js';
import {
  parseAdjustStockBody,
  parseAvailabilityQuery,
  parseBookId,
  parseListStockQuery,
  parseSetStockBody,
  parseValidateBody,
} from './inventory.validation.js';

const asList = guard => (Array.isArray(guard) ? guard : [guard]);

/**
 * Inventory API. Mounted by the integration owner at /api/inventory.
 *
 *   GET   /availability?bookIds=1,2   Public. Availability labels, never exact quantities.
 *   POST  /validate                   Signed in. { items:[{bookId,quantity}] } -> { ok, shortages }
 *   GET   /stock                      Admin. Exact stock, lowest first (?q ?status=low|out ?page ?pageSize)
 *   GET   /stock/:bookId              Admin.
 *   PUT   /stock/:bookId              Admin. { quantity, reason? } set the exact stock (stock-take)
 *   PATCH /stock/:bookId              Admin. { change, reason? } add or remove copies
 *
 * Administrator catalogue editing (titles, prices, ...) is Varchas's /api/admin/books.
 */
export function createInventoryRouter({ pool, requireAuth, requireAdmin }) {
  const router = Router();
  const signedIn = asList(requireAuth);
  const adminOnly = asList(requireAdmin);

  router.get('/availability', asyncHandler(async (request, response) => {
    response.json({ availability: await service.getAvailability(pool, parseAvailabilityQuery(request.query)) });
  }));

  router.post('/validate', ...signedIn, asyncHandler(async (request, response) => {
    response.json(await service.checkAvailability(pool, parseValidateBody(request.body)));
  }));

  router.get('/stock', ...adminOnly, asyncHandler(async (request, response) => {
    const params = parseListStockQuery(request.query);
    const { items, totalItems, totalPages } = await inventory.listStock(pool, params);
    response.json({ stock: items, pagination: { page: params.page, pageSize: params.pageSize, totalItems, totalPages } });
  }));

  router.get('/stock/:bookId', ...adminOnly, asyncHandler(async (request, response) => {
    const stock = await inventory.getStock(pool, parseBookId(request.params.bookId));
    if (!stock) throw notFound('We could not find that book in the inventory.', 'BOOK_NOT_FOUND');
    response.json({ stock });
  }));

  router.put('/stock/:bookId', ...adminOnly, asyncHandler(async (request, response) => {
    const bookId = parseBookId(request.params.bookId);
    const { quantity, reason } = parseSetStockBody(request.body);
    await service.setStock(pool, { bookId, quantity, adminId: request.user.id, reason });
    response.json({ stock: await inventory.getStock(pool, bookId) });
  }));

  router.patch('/stock/:bookId', ...adminOnly, asyncHandler(async (request, response) => {
    const bookId = parseBookId(request.params.bookId);
    const { change, reason } = parseAdjustStockBody(request.body);
    await service.adjustStock(pool, { bookId, change, adminId: request.user.id, reason });
    response.json({ stock: await inventory.getStock(pool, bookId) });
  }));

  return router;
}
