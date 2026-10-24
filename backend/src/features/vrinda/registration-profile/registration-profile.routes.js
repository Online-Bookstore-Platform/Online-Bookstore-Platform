import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError, asyncHandler, notFound } from '../shared/errors.js';
import { parseProfilePatch, parseRegistration } from './registration.validation.js';
import * as repository from './registration-profile.repository.js';

const registerLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

export function createRegistrationProfileRouter({ pool, requireAuth, hashPassword }) {
  const router = Router();

  router.post('/users/register', registerLimit, asyncHandler(async (request, response) => {
    const input = parseRegistration(request.body);
    try {
      const passwordHash = await hashPassword(input.password);
      const user = await repository.createCustomer(pool, { ...input, passwordHash });
      response.status(201).json({ user });
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email address already exists.');
      throw error;
    }
  }));

  if (requireAuth) {
    router.get('/profile', requireAuth, asyncHandler(async (request, response) => {
      const user = await repository.getProfile(pool, request.user.id);
      if (!user) throw notFound('We could not find your profile.', 'PROFILE_NOT_FOUND');
      response.json({ user });
    }));

    router.patch('/profile', requireAuth, asyncHandler(async (request, response) => {
      const changes = parseProfilePatch(request.body);
      try {
        const user = await repository.updateProfile(pool, request.user.id, changes);
        if (!user) throw notFound('We could not find your profile.', 'PROFILE_NOT_FOUND');
        response.json({ user });
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email address already exists.');
        throw error;
      }
    }));
  }

  return router;
}
