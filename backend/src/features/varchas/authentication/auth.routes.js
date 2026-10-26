import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError, asyncHandler } from '../errors.js';
import { publicUser } from './auth.service.js';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from './password.js';

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const resetRequestLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const resetCompletionLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

function regenerateSession(session) {
  return new Promise((resolve, reject) => session.regenerate(error => error ? reject(error) : resolve()));
}

function saveSession(session) {
  return new Promise((resolve, reject) => session.save(error => error ? reject(error) : resolve()));
}

function destroySession(session) {
  return new Promise((resolve, reject) => session.destroy(error => error ? reject(error) : resolve()));
}

export function createAuthRouter({ authService, requireAuth, users = {}, sessionCookieName = 'folio.sid', env = process.env }) {
  const router = Router();

  router.post('/forgot-password', resetRequestLimit, asyncHandler(async (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const validEmail = email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    let devResetToken;
    if (validEmail && users.findResetUserByEmail && users.savePasswordReset) {
      const user = await users.findResetUserByEmail(email);
      if (user) {
        const token = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        await users.savePasswordReset(user.id, tokenHash, new Date(Date.now() + 30 * 60 * 1000));
        const localHost = ['localhost', '127.0.0.1', '::1'].includes(request.hostname);
        if (env.NODE_ENV !== 'production' && env.DEV_PASSWORD_RESET_LINK === 'true' && localHost) devResetToken = token;
      }
    }
    response.json({ message: 'If an account matches that email, password reset instructions will be sent.' , ...(devResetToken ? { developmentToken: devResetToken } : {}) });
  }));

  router.post('/reset-password', resetCompletionLimit, asyncHandler(async (request, response) => {
    const { token, password } = request.body ?? {};
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token) || typeof password !== 'string' || password.length < 8 || password.length > 200) {
      throw new HttpError(400, 'INVALID_RESET_INPUT', 'Enter a valid reset link and a password between 8 and 200 characters.');
    }
    if (!users.consumePasswordReset) throw new HttpError(503, 'RESET_UNAVAILABLE', 'Password reset is not configured.');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const changed = await users.consumePasswordReset(tokenHash, await hashPassword(password));
    if (!changed) throw new HttpError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or expired. Request a new one.');
    if (request.session) await destroySession(request.session);
    response.clearCookie(sessionCookieName, { httpOnly: true, sameSite: 'strict', secure: env.NODE_ENV === 'production', path: '/' });
    response.status(204).end();
  }));

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
