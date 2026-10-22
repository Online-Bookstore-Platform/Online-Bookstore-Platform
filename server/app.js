'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { createBookRouter } = require('./routes/book.routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

/**
 * Build the Express app. The database pool is injected so tests can point the
 * app at a throw-away database.
 *
 * @param {{ pool: import('mysql2/promise').Pool }} deps
 */
function createApp({ pool }) {
  const app = express();

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

  app.use('/api/books', createBookRouter({ pool }));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
