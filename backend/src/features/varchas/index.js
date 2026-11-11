import { Router } from 'express';
import session from 'express-session';
import { randomBytes } from 'node:crypto';
import { unavailableDependency } from './errors.js';
import { createAuthService } from './authentication/auth.service.js';
import { createAuthMiddleware } from './authentication/auth.middleware.js';
import { createAuthRouter } from './authentication/auth.routes.js';
import { createBooksRouter, createAdminBooksRouter } from './book-details/books.routes.js';
import { createPaymentService } from './payments/payment.service.js';
import { createPaymentsRouter } from './payments/payments.routes.js';
import { createEmailService } from './authentication/email.service.js';
import { createMySqlPaymentOtpRepository } from './payments/mysql-payment-otp.repository.js';
import { createMySqlOrderConfirmationRepository } from '../vrinda/orders/mysql-order-confirmation.repository.js';
import { createOrderConfirmationService } from '../vrinda/orders/order-confirmation.service.js';

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

export function createVarchasRouter({ repositories = {}, env = process.env, pool, emailService: injectedEmailService, logger = console } = {}) {
  const router = Router();
  const deps = { ...unavailableRepositories, ...repositories };
  const authService = createAuthService(deps.users);
  const auth = createAuthMiddleware(deps.users);
  const emailService = injectedEmailService || createEmailService(env);
  const otpChallenges = deps.paymentOtpChallenges || (pool ? createMySqlPaymentOtpRepository(pool) : null);
  const confirmationEmails = createOrderConfirmationService({
    deliveries: pool ? createMySqlOrderConfirmationRepository(pool) : deps.orderConfirmationDeliveries,
    emailService, orders: deps.orders, logger,
  });
  const paymentService = createPaymentService({ orders: deps.orders, payments: deps.payments, otpChallenges, emailService, orderConfirmationEmails: confirmationEmails, secret: env.SESSION_SECRET, logger });

  router.use('/auth', createAuthRouter({ authService, requireAuth: auth.requireAuth, users: deps.users, emailService, env }));
  router.use('/books', createBooksRouter({ books: deps.books, requireAdmin: auth.requireAdmin }));
  router.use('/payments', createPaymentsRouter({ paymentService, requireAuth: auth.requireAuth }));
  router.use('/admin', createAdminBooksRouter({ books: deps.books, requireAdmin: auth.requireAdmin }));
  return router;
}
