'use strict';

const { Router } = require('express');
const { createBookController } = require('../controllers/book.controller');

function createBookRouter({ pool }) {
  const router = Router();
  const controller = createBookController({ pool });

  router.get('/filters', controller.filters);
  router.get('/', controller.list);

  return router;
}

module.exports = { createBookRouter };
