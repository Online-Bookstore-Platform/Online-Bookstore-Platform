'use strict';

/**
 * PLACEHOLDER AUTHENTICATION - to be replaced by the real implementation of
 * issue #1 (Customer Authentication and Role-Based Access).
 *
 * The rest of the API only relies on this contract, so swapping the
 * implementation does not touch any other file:
 *
 *   - `authenticate` sets `req.user = { id, role }` ('customer' | 'admin') for a
 *     signed-in request, and leaves it undefined otherwise;
 *   - `requireCustomer` / `requireAdmin` answer 401 when nobody is signed in and
 *     403 when the signed-in user has the wrong role (SRS SEC-1, SEC-3, SEC-8).
 *
 * Until #1 lands, a request can identify itself with the header
 *     X-Dev-User-Id: <customers.id>
 * but ONLY when ALLOW_DEV_AUTH=true. That header is trivially forgeable: never
 * enable the flag on a deployed server. It is off by default, so without it every
 * protected route answers 401.
 */

const { HttpError } = require('../utils/httpError');

const unauthenticated = () => new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
const forbidden = () => new HttpError(403, 'FORBIDDEN', 'You do not have permission to do this.');

/**
 * @param {{ pool: import('mysql2/promise').Pool, allowDevAuth?: boolean }} deps
 */
function createAuth({ pool, allowDevAuth = false }) {
  async function authenticate(req, _res, next) {
    if (!allowDevAuth) return next();

    const header = req.get('x-dev-user-id');
    if (header === undefined) return next();
    if (!/^[1-9]\d{0,17}$/.test(header)) return next(unauthenticated());

    const [rows] = await pool.query('SELECT id, role FROM customers WHERE id = ?', [Number(header)]);
    if (rows.length === 0) return next(unauthenticated());

    req.user = { id: rows[0].id, role: rows[0].role };
    return next();
  }

  const requireRole = (role) => (req, _res, next) => {
    if (!req.user) return next(unauthenticated());
    if (req.user.role !== role) return next(forbidden());
    return next();
  };

  return {
    authenticate,
    requireCustomer: requireRole('customer'),
    requireAdmin: requireRole('admin'),
  };
}

module.exports = { createAuth };
