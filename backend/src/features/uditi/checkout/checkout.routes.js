import { Router } from 'express';
import { asyncHandler } from '../shared/errors.js';
import { parseDeliveryDetails } from './checkout.validation.js';
import { getCheckoutSummary, saveDeliveryDetails } from './checkout.service.js';

/**
 * Checkout API for signed-in customers. Mounted by the integration owner at /api/checkout.
 * It is always about THE SIGNED-IN USER's own cart: the user comes from the session,
 * never from an id in the URL or body (SEC-3).
 *
 *   GET /summary    cart review: lines at current prices, stock problems, totals, saved delivery
 *   PUT /delivery   validate and save the delivery details
 */
export function createCheckoutRouter({ pool, requireAuth, cartReader }) {
  const router = Router();
  const signedIn = Array.isArray(requireAuth) ? requireAuth : [requireAuth];

  router.use(...signedIn);
  // Personal data (name, phone, address): never let a browser or proxy keep a copy.
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/summary', asyncHandler(async (request, response) => {
    response.json({ checkout: await getCheckoutSummary({ pool, cartReader }, request.user) });
  }));

  router.put('/delivery', asyncHandler(async (request, response) => {
    const details = parseDeliveryDetails(request.body);
    response.json({ delivery: await saveDeliveryDetails({ pool, cartReader }, request.user, details) });
  }));

  return router;
}
