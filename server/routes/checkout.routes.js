'use strict';

const { Router } = require('express');
const { createCheckoutController } = require('../controllers/checkout.controller');

/**
 * Checkout is for signed-in customers and always about THEIR OWN cart: the cart is
 * found from the signed-in user, never from an id in the URL (SEC-3).
 */
function createCheckoutRouter({ pool, auth }) {
  const router = Router();
  const controller = createCheckoutController({ pool });

  router.use(auth.requireCustomer);
  // Personal data (name, phone, address): never let a browser or proxy keep a copy.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/', controller.summary);
  router.put('/delivery', controller.saveDelivery);

  return router;
}

module.exports = { createCheckoutRouter };
