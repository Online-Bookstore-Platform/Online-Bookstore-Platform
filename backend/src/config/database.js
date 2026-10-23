import mysql from 'mysql2/promise';

/** Connection settings read from the environment (names are listed in .env.example). */
export function databaseConfigFromEnv(env = process.env) {
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
 * decimalNumbers: DECIMAL columns (prices, totals) come back as JS numbers rather
 * than strings. Money arithmetic is still done in whole paise (see
 * features/uditi/shared/money.js), never by adding floating-point prices.
 */
export function createDatabasePool(overrides = {}, env = process.env) {
  return mysql.createPool({
    ...databaseConfigFromEnv(env),
    waitForConnections: true,
    connectionLimit: Number(env.DB_POOL_SIZE || 10),
    charset: 'utf8mb4',
    decimalNumbers: true,
    ...overrides,
  });
}
