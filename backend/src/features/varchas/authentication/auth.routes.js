import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError, asyncHandler } from '../errors.js';
import { publicUser } from './auth.service.js';

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

function regenerateSession(session) {
  return new Promise((resolve, reject) => session.regenerate(error => error ? reject(error) : resolve()));
}

function saveSession(session) {
  return new Promise((resolve, reject) => session.save(error => error ? reject(error) : resolve()));
}

function destroySession(session) {
  return new Promise((resolve, reject) => session.destroy(error => error ? reject(error) : resolve()));
}

export function createAuthRouter({ authService, requireAuth, sessionCookieName = 'folio.sid' }) {
  const router = Router();

  router.post('/login', loginLimit, asyncHandler(async (request, response) => {
    const { email, password } = request.body ?? {};
    if (typeof email !== 'string' || email.trim().length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 8 || password.length > 200) {
      throw new HttpError(400, 'INVALID_LOGIN_INPUT', 'Enter a valid email and a password of at least 8 characters.');
    }
    const user = await authService.authenticate(email.trim().toLowerCase(), password);
    await regenerateSession(request.session);
    request.session.userId = user.id;
    await saveSession(request.session);
    response.json({ user });
  }));

  router.post('/logout', asyncHandler(async (request, response) => {
    if (request.session) await destroySession(request.session);
    response.clearCookie(sessionCookieName, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
    response.status(204).end();
  }));

  router.get('/me', requireAuth, (request, response) => response.json({ user: publicUser(request.user) }));
  return router;
}
