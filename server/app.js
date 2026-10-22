'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { createBookRouter } = require('./routes/book.routes');
const { createInventoryRouter } = require('./routes/inventory.routes');
const { createAuth } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

/**
 * Build the Express app. The database pool is injected so tests can point the
 * app at a throw-away database.
 *
 * @param {{ pool: import('mysql2/promise').Pool, allowDevAuth?: boolean }} deps
 *   allowDevAuth - accept the forgeable X-Dev-User-Id header until real sign-in
 *   (issue #1) exists. Never enable on a deployed server.
 */
function createApp({ pool, allowDevAuth = false }) {
  const app = express();
  const auth = createAuth({ pool, allowDevAuth });

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  app.use(auth.authenticate);

  app.use('/api/books', createBookRouter({ pool }));
  app.use('/api/inventory', createInventoryRouter({ pool, auth }));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
