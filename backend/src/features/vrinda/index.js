import { Router } from 'express';
import { hashPassword } from '../varchas/authentication/password.js';
import { checkAvailability, deductStock } from '../uditi/inventory/inventory.service.js';
import { withTransaction } from '../uditi/shared/transaction.js';
import { createRegistrationProfileRouter } from './registration-profile/registration-profile.routes.js';
import { createCartRouter } from './cart/cart.routes.js';
import { createOrdersRouter } from './orders/orders.routes.js';
import { unavailableDependency, vrindaErrorHandler } from './shared/errors.js';

export function createVrindaRouter({ pool, requireAuth } = {}) {
  const router = Router();
  const missing = message => (_request, _response, next) => next(unavailableDependency(message));

  if (!pool) {
    router.use(missing('The database connection is not configured.'));
  } else {
    const authMiddleware = requireAuth ?? missing('Varchas sign-in middleware is not connected.');
    router.use(createRegistrationProfileRouter({ pool, requireAuth: authMiddleware, hashPassword }));

    if (!requireAuth) {
      router.use(['/cart', '/orders'], missing('Varchas sign-in middleware is not connected.'));
    } else {
      router.use('/cart', createCartRouter({ pool, requireAuth }));
      router.use('/orders', createOrdersRouter({ pool, requireAuth, checkAvailability, withTransaction, deductStock }));
    }
  }

  router.use(vrindaErrorHandler);
  return router;
}

export { createRegistrationProfileRouter } from './registration-profile/registration-profile.routes.js';
export { createCartRouter } from './cart/cart.routes.js';
export { createOrdersRouter } from './orders/orders.routes.js';
export { createVrindaOrderService } from './orders/orders.service.js';
