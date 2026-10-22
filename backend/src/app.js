import express from 'express';
import { createSessionMiddleware, createVarchasRouter } from './features/varchas/index.js';

export function createApp({ repositories, sessionSecret, sessionStore, env = process.env } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use(createSessionMiddleware({ secret: sessionSecret || env.SESSION_SECRET, store: sessionStore, production: env.NODE_ENV === 'production' }));

  app.get('/api/health', (_request, response) => response.json({ status: 'ok', service: 'online-bookstore-api' }));
  app.use('/api', createVarchasRouter({ repositories, env }));
  app.use((_request, response) => response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }));
  app.use((error, _request, response, _next) => {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const dependencyUnavailable = ['DEPENDENCY_NOT_CONFIGURED', 'PAYMENT_PROVIDER_NOT_CONFIGURED'].includes(error.code);
    if (status >= 500 && !dependencyUnavailable) console.error(error);
    response.status(status).json({
      error: {
        code: error.code || (status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR'),
        message: status < 500 || dependencyUnavailable ? error.message : 'An unexpected server error occurred.',
      },
    });
  });
  return app;
}
