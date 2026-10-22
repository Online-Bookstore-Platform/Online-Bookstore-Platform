import { HttpError, asyncHandler } from '../errors.js';

export function createAuthMiddleware(users) {
  const requireAuth = asyncHandler(async (request, _response, next) => {
    if (!request.session?.userId) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const user = await users.findById(request.session.userId);
    if (!user) throw new HttpError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    request.user = user;
    next();
  });

  const requireAdmin = [requireAuth, (request, _response, next) => {
    if (request.user.role !== 'admin') return next(new HttpError(403, 'FORBIDDEN', 'Administrator access is required.'));
    next();
  }];

  return { requireAuth, requireAdmin };
}
