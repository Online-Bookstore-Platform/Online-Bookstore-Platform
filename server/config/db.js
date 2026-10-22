'use strict';

const mysql = require('mysql2/promise');

/** Connection settings read from the environment (see .env.example). */
function dbConfigFromEnv(env = process.env) {
  return {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  };
}

/**
 * Create a MySQL connection pool.
 *
 * decimalNumbers: DECIMAL columns (prices, totals) come back as JS numbers
 * instead of strings. Money maths in the app is still done in whole cents
 * (see utils/money.js), never with floating-point addition.
 */
function createPool(overrides = {}) {
  return mysql.createPool({
    ...dbConfigFromEnv(),
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    charset: 'utf8mb4',
    decimalNumbers: true,
    ...overrides,
  });
}

module.exports = { createPool, dbConfigFromEnv };
