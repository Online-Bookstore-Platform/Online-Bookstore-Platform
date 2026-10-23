/**
 * Uditi's backend features: catalogue (#3), checkout (#7), inventory (#10).
 * Database schema and connection (#13) live in backend/database/ and src/config/database.js.
 *
 * This module is NOT mounted in src/app.js yet - the integration owner connects it:
 *
 *   import { createDatabasePool } from './config/database.js';
 *   import { createUditiRouter, createDatabaseCartReader } from './features/uditi/index.js';
 *
 *   const pool = createDatabasePool();
 *   app.use('/api', createUditiRouter({
 *     pool,
 *     requireAuth: auth.requireAuth,        // from Varchas's createAuthMiddleware
 *     requireAdmin: auth.requireAdmin,
 *     cartReader: createDatabaseCartReader(pool),   // or Vrinda's cart service (see cart.reader.js)
 *   }));
 *
 * Routes (all under /api): /catalogue/*, /inventory/*, /checkout/*. See README.md here.
 */

import { Router } from 'express';
import { createCatalogueRouter } from './catalogue/catalogue.routes.js';
import { createInventoryRouter } from './inventory/inventory.routes.js';
import { createCheckoutRouter } from './checkout/checkout.routes.js';
import { uditiErrorHandler, unavailableDependency } from './shared/errors.js';

/**
 * @param {object} deps
 * @param {import('mysql2/promise').Pool} [deps.pool]   without it every route answers 503
 * @param {Function|Function[]} deps.requireAuth        middleware: signed-in user -> request.user
 * @param {Function|Function[]} deps.requireAdmin       middleware: signed-in administrator
 * @param {{ getItems(userId): Promise<Array<{bookId, quantity}>> }} [deps.cartReader]
 */
export function createUditiRouter({ pool, requireAuth, requireAdmin, cartReader } = {}) {
  const router = Router();
  const failClosed = message => (_request, _response, next) => next(unavailableDependency(message));

  // Anything that cannot work safely is closed with a 503 instead of being left open or faked.
  if (!pool) {
    router.use(['/catalogue', '/inventory', '/checkout'], failClosed('The database connection is not configured.'));
  } else {
    const signInMissing = failClosed('Sign-in (requireAuth/requireAdmin) is not connected to these routes.');
    router.use('/catalogue', createCatalogueRouter({ pool }));
    router.use('/inventory', requireAuth && requireAdmin ? createInventoryRouter({ pool, requireAuth, requireAdmin }) : signInMissing);
    router.use('/checkout', requireAuth ? createCheckoutRouter({ pool, requireAuth, cartReader }) : signInMissing);
  }

  router.use(uditiErrorHandler);
  return router;
}

// For the order and payment features (Vrinda, Varchas):
export { createDatabaseCartReader } from './checkout/cart.reader.js';
export { getCheckoutSummary } from './checkout/checkout.service.js';
export { parseDeliveryDetails } from './checkout/checkout.validation.js';
export { checkAvailability, deductStock, restoreStock, InsufficientStockError } from './inventory/inventory.service.js';
export { withTransaction } from './shared/transaction.js';
