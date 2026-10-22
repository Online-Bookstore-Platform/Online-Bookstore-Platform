import { HttpError } from '../errors.js';
import { verifyPassword } from './password.js';

export function publicUser(user) {
  return { id: user.id, name: user.name ?? '', email: user.email, role: user.role };
}

export function createAuthService(users) {
  return {
    async authenticate(email, password) {
      const user = await users.findByEmail(email);
      const valid = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
      if (!valid || !['customer', 'admin'].includes(user.role)) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      return publicUser(user);
    },
    async getCurrentUser(id) {
      const user = await users.findById(id);
      if (!user) throw new HttpError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
      return publicUser(user);
    },
  };
}
