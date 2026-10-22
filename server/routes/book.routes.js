'use strict';

const { Router } = require('express');
const { createBookController } = require('../controllers/book.controller');

function createBookRouter({ pool }) {
  const router = Router();
  const controller = createBookController({ pool });

  // "/filters" must be declared before "/:id"
  router.get('/filters', controller.filters);
  router.get('/', controller.list);
  router.get('/:id', controller.get);

  return router;
}

module.exports = { createBookRouter };
