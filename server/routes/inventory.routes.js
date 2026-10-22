'use strict';

const { Router } = require('express');
const { createInventoryController } = require('../controllers/inventory.controller');

/**
 * Stock management is for administrators only (SRS 5.7, SEC-3).
 * Customers see availability through GET /api/books, which never exposes exact quantities.
 */
function createInventoryRouter({ pool, auth }) {
  const router = Router();
  const controller = createInventoryController({ pool });

  router.use(auth.requireAdmin);
  router.get('/', controller.list);
  router.get('/:bookId', controller.get);
  router.put('/:bookId', controller.set);
  router.patch('/:bookId', controller.adjust);

  return router;
}

module.exports = { createInventoryRouter };
