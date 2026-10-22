import { Router } from 'express';
import session from 'express-session';
import { randomBytes } from 'node:crypto';
import { unavailableDependency } from './errors.js';
import { createAuthService } from './authentication/auth.service.js';
import { createAuthMiddleware } from './authentication/auth.middleware.js';
import { createAuthRouter } from './authentication/auth.routes.js';
import { createBooksRouter, createAdminBooksRouter } from './book-details/books.routes.js';
import { createPaymentProvider } from './payments/payment.provider.js';
import { createPaymentService } from './payments/payment.service.js';
import { createPaymentsRouter } from './payments/payments.routes.js';

export const unavailableRepositories = {
  users: unavailableDependency('users repository'),
  books: unavailableDependency('books repository'),
  orders: unavailableDependency('orders service'),
  payments: unavailableDependency('payments repository'),
};

export function createSessionMiddleware({ secret, store, production = process.env.NODE_ENV === 'production' } = {}) {
  if (production && (!secret || !store)) throw new Error('Production requires SESSION_SECRET and a persistent session store.');
  return session({
    name: 'folio.sid',
    secret: secret || randomBytes(32).toString('hex'),
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'strict', secure: production, maxAge: 1000 * 60 * 60 * 8, path: '/' },
  });
}

export function createVarchasRouter({ repositories = unavailableRepositories, env = process.env } = {}) {
  const router = Router();
  const authService = createAuthService(repositories.users);
  const auth = createAuthMiddleware(repositories.users);
  const paymentService = createPaymentService({ orders: repositories.orders, payments: repositories.payments, provider: createPaymentProvider(env) });

  router.use('/auth', createAuthRouter({ authService, requireAuth: auth.requireAuth }));
  router.use('/books', createBooksRouter({ books: repositories.books, requireAdmin: auth.requireAdmin }));
  router.use('/payments', createPaymentsRouter({ paymentService, requireAuth: auth.requireAuth }));
  router.use('/admin', createAdminBooksRouter({ books: repositories.books, requireAdmin: auth.requireAdmin }));
  return router;
}
