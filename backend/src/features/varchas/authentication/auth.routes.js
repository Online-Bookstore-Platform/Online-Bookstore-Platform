import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError, asyncHandler } from '../errors.js';
import { publicUser } from './auth.service.js';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
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

export function createAuthRouter({ authService, requireAuth, users = {}, emailService, sessionCookieName = 'folio.sid', env = process.env }) {
  const router = Router();
  const resetPepper = env.SESSION_SECRET || randomBytes(32).toString('hex');

  router.post('/forgot-password', resetRequestLimit, asyncHandler(async (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const validEmail = email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (validEmail && !emailService?.configured) throw new HttpError(503, 'EMAIL_PROVIDER_NOT_CONFIGURED', 'Password reset email is unavailable. Configure EMAIL_FROM, GMAIL_USER, and GMAIL_APP_PASSWORD in backend/.env.');
    if (validEmail && users.findResetUserByEmail && users.savePasswordReset) {
      const user = await users.findResetUserByEmail(email);
      if (user) {
        const otp = String(randomInt(100000, 1000000));
        const otpHash = createHmac('sha256', resetPepper).update(`${email}:${otp}`).digest('hex');
        const saved = await users.savePasswordReset(user.id, otpHash, new Date(Date.now() + 5 * 60 * 1000));
        if (saved && emailService) {
          try { await emailService.sendPasswordResetOtp({ to: email, otp }); }
          catch { console.error('Password reset email delivery failed.'); }
        }
      }
    }
    response.json({ message: 'If an account matches, a reset code may be delivered to its registered email address.' });
  }));

  router.post('/verify-reset-otp', resetCompletionLimit, asyncHandler(async (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const otp = request.body?.otp;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw new HttpError(400, 'INVALID_RESET_CODE', 'Enter the email address and six-digit code from your reset email.');
    const proof = randomBytes(32).toString('base64url');
    const otpHash = createHmac('sha256', resetPepper).update(`${email}:${otp}`).digest('hex');
    const proofHash = createHmac('sha256', resetPepper).update(proof).digest('hex');
    const verified = await users.verifyPasswordResetOtp?.(email, otpHash, proofHash, new Date(Date.now() + 10 * 60 * 1000));
    if (!verified) throw new HttpError(400, 'INVALID_RESET_CODE', 'This code is invalid, expired, or has already been used. Request a new code.');
    response.json({ resetToken: proof });
  }));

  router.post('/reset-password', resetCompletionLimit, asyncHandler(async (request, response) => {
    const { password } = request.body ?? {};
    const token = request.body?.resetToken ?? request.body?.token;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token) || typeof password !== 'string' || password.length < 8 || password.length > 200) {
      throw new HttpError(400, 'INVALID_RESET_INPUT', 'Verify your email code first, then enter a password between 8 and 200 characters.');
    }
    if (!users.consumePasswordReset) throw new HttpError(503, 'RESET_UNAVAILABLE', 'Password reset is not configured.');
    const tokenHash = createHmac('sha256', resetPepper).update(token).digest('hex');
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
