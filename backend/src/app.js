import express from 'express';
import { createSessionMiddleware, createVarchasRouter, unavailableRepositories } from './features/varchas/index.js';
import { createOpenLibraryCatalogueRouter } from './features/uditi/catalogue/open-library.js';
import { createAuthMiddleware } from './features/varchas/authentication/auth.middleware.js';
import { createVrindaRouter } from './features/vrinda/index.js';
import { createUditiRouter } from './features/uditi/index.js';
import { createDatabaseCartReader } from './features/uditi/checkout/cart.reader.js';
import { createReviewsRouter } from './features/varchas/book-details/reviews.routes.js';

export function createApp({ repositories, pool, sessionSecret, sessionStore, env = process.env } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use(createSessionMiddleware({ secret: sessionSecret || env.SESSION_SECRET, store: sessionStore, production: env.NODE_ENV === 'production' }));

  app.get('/api/health', (_request, response) => response.json({ status: 'ok', service: 'online-bookstore-api' }));
  app.use('/api/catalogue', createOpenLibraryCatalogueRouter({ pool, env }));
  const userRepository = repositories?.users;
  app.use('/api', createVarchasRouter({ repositories, env }));
  const auth = createAuthMiddleware(userRepository || unavailableRepositories.users);
  if (pool) app.use('/api/books', createReviewsRouter({ pool, requireAuth: auth.requireAuth }));
  app.use('/api', createVrindaRouter({ pool, requireAuth: auth.requireAuth }));
  app.use('/api', createUditiRouter({ pool, requireAuth: auth.requireAuth, requireAdmin: auth.requireAdmin, cartReader: pool ? createDatabaseCartReader(pool) : undefined }));
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
