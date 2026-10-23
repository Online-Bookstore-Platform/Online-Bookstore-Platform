/*
 * Shared helpers for Uditi's backend tests (catalogue, inventory, checkout, database).
 *
 * The tests run against a real, throw-away MySQL database (schema.sql applied, sample data
 * optional) because the things being tested - constraints, row locks, SQL filters - only
 * exist in MySQL. Connection settings come from backend/.env (DB_*), whose user must be
 * allowed to create and drop databases.
 *
 * When MySQL cannot be reached the database tests are SKIPPED (with the reason) instead of
 * failing, so `npm test` still works on a machine without a database.
 */

import { existsSync } from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mysql from 'mysql2/promise';
import { databaseConfigFromEnv, createDatabasePool } from '../../src/config/database.js';
import { setupDatabase } from '../../database/setup.js';
import { createAuthMiddleware } from '../../src/features/varchas/authentication/auth.middleware.js';
import { createUditiRouter, createDatabaseCartReader } from '../../src/features/uditi/index.js';

const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE); // never overrides variables that are already set

const baseConfig = databaseConfigFromEnv();

async function probeDatabase() {
  if (!baseConfig.user) return 'DB_USER is not set (copy backend/.env.example to backend/.env).';
  const { database: _ignored, ...serverConfig } = baseConfig;
  try {
    const connection = await mysql.createConnection({ ...serverConfig, connectTimeout: 2000 });
    await connection.end();
    return '';
  } catch (error) {
    return `MySQL is not reachable (${error.code || error.message}).`;
  }
}

const reason = await probeDatabase();

/** true when the database tests can run. */
export const databaseAvailable = reason === '';

/** Pass as `describe(name, databaseTests, ...)` options to skip a suite when there is no MySQL. */
export const databaseTests = { skip: databaseAvailable ? false : reason };

/**
 * Create a throw-away database (schema applied, optionally with the sample data) so tests
 * never touch real data.
 */
export async function createTestDatabase({ seed = false } = {}) {
  const name = `bookstore_test_${process.pid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await setupDatabase({ config: { ...baseConfig, database: name }, reset: true, seed });
  const pool = createDatabasePool({ database: name, connectionLimit: 20 });

  return {
    name,
    pool,
    async drop() {
      await pool.end();
      const { database: _ignored, ...serverConfig } = baseConfig;
      const connection = await mysql.createConnection(serverConfig);
      try {
        await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
      } finally {
        await connection.end();
      }
    },
  };
}

/** Assert that a query is rejected by MySQL with the given error code. */
export async function assertDbError(promise, code, message) {
  await assert.rejects(promise, error => {
    assert.equal(error.code, code, message || `expected ${code}, got ${error.code}: ${error.sqlMessage}`);
    return true;
  });
}

/**
 * Start a small Express app with the Uditi router mounted the way the integration owner
 * will mount it (under /api), signing in with Varchas's real auth middleware.
 *
 * Sign in by sending the `x-test-user: <user id>` header - it stands in for the session
 * cookie that Varchas's login sets, so requests without it are "not signed in".
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} [options]
 * @param {object|null} [options.cartReader]  default: reads the shared carts tables; null = not connected
 * @param {boolean} [options.withPool]        false = mount the router without a database
 */
export async function startTestServer(pool, { cartReader, withPool = true, withAuth = true } = {}) {
  const users = {
    async findById(id) {
      const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
      return rows[0] ?? null;
    },
  };
  const { requireAuth, requireAdmin } = createAuthMiddleware(users);

  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use((request, _response, next) => {
    const userId = request.get('x-test-user');
    request.session = userId ? { userId: Number(userId) } : {};
    next();
  });
  app.use(
    '/api',
    createUditiRouter({
      pool: withPool ? pool : undefined,
      requireAuth: withAuth ? requireAuth : undefined,
      requireAdmin: withAuth ? requireAdmin : undefined,
      cartReader: cartReader === undefined ? createDatabaseCartReader(pool) : cartReader ?? undefined,
    })
  );
  // Same shape as the error handler in src/app.js.
  app.use((_request, response) => response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }));
  app.use((error, _request, response, _next) => {
    const status = Number.isInteger(error.status) ? error.status : 500;
    response.status(status).json({ error: { code: error.code || 'INTERNAL_ERROR', message: status < 500 || error.code === 'DEPENDENCY_NOT_CONFIGURED' ? error.message : 'An unexpected server error occurred.' } });
  });

  const server = await new Promise(resolve => {
    const listening = http.createServer(app).listen(0, '127.0.0.1', () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { body, user, headers = {} } = {}) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(user ? { 'x-test-user': String(user) } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  }

  return {
    baseUrl,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    put: (path, body, options) => request('PUT', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

/** Insert helpers: each call creates unique, valid rows. */
export function createFixtures(pool) {
  let sequence = 0;
  const next = () => ++sequence;

  const fixtures = {
    next,

    async addUser(overrides = {}) {
      const n = next();
      const row = {
        name: `Customer ${n}`,
        email: `customer${n}@example.com`,
        password_hash: '$2b$10$placeholderplaceholderplaceholderplaceholderplaceholde',
        terms_accepted_at: '2026-09-01 09:00:00',
        ...overrides,
      };
      const [result] = await pool.query('INSERT INTO users SET ?', [row]);
      return result.insertId;
    },

    async addCategory(name = `Category ${next()}`) {
      const [result] = await pool.query('INSERT INTO categories (name) VALUES (?)', [name]);
      return result.insertId;
    },

    /** A book with an inventory row. `quantity: null` creates the book without one. */
    async addBook({ quantity = 10, ...overrides } = {}) {
      const n = next();
      const row = {
        isbn: `97810000${String(n).padStart(5, '0')}`,
        title: `Book ${n}`,
        author: `Author ${n}`,
        price: 199.0,
        ...overrides,
      };
      if (row.category_id === undefined) row.category_id = await fixtures.addCategory();
      const [result] = await pool.query('INSERT INTO books SET ?', [row]);
      if (quantity !== null) await pool.query('INSERT INTO inventory (book_id, quantity) VALUES (?, ?)', [result.insertId, quantity]);
      return result.insertId;
    },

    async addOrder(userId, overrides = {}) {
      const n = next();
      const row = {
        order_number: `ORD-${String(n).padStart(6, '0')}`,
        user_id: userId,
        total_amount: 398.0,
        recipient_name: 'Test Person',
        phone: '9876543210',
        address_line1: '1 Test Street',
        city: 'Bengaluru',
        state: 'Karnataka',
        postal_code: '560085',
        country: 'India',
        ...overrides,
      };
      const [result] = await pool.query('INSERT INTO orders SET ?', [row]);
      return result.insertId;
    },

    /** Put books in a user's cart (creating the cart). `items` = [{ bookId, quantity }]. */
    async fillCart(userId, items) {
      const [existing] = await pool.query('SELECT id FROM carts WHERE user_id = ?', [userId]);
      let cartId = existing[0]?.id;
      if (!cartId) [{ insertId: cartId }] = await pool.query('INSERT INTO carts (user_id) VALUES (?)', [userId]);
      for (const { bookId, quantity } of items) {
        await pool.query('INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, ?, ?)', [cartId, bookId, quantity]);
      }
      return cartId;
    },

    async stockOf(bookId) {
      const [[row]] = await pool.query('SELECT quantity FROM inventory WHERE book_id = ?', [bookId]);
      return row.quantity;
    },
  };
  return fixtures;
}

/** A delivery body that passes validation; override single fields in tests. */
export const validDelivery = (overrides = {}) => ({
  recipientName: 'Asha Verma',
  phone: '98765 43210',
  addressLine1: '12 MG Road',
  addressLine2: 'Flat 4B',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'India',
  ...overrides,
});
