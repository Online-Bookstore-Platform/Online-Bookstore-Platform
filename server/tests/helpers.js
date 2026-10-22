'use strict';

const path = require('node:path');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { createPool, dbConfigFromEnv } = require('../config/db');
const { setupDatabase } = require('../scripts/db-setup');

/**
 * Create a throw-away database (schema applied, optionally seeded) so tests
 * never touch the developer's real data. Needs DB_* in server/.env with a user
 * allowed to CREATE/DROP databases.
 */
async function createTestDatabase({ seed = false } = {}) {
  const base = dbConfigFromEnv();
  const name = `bookstore_test_${process.pid}_${Date.now().toString(36)}`;

  await setupDatabase({ config: { ...base, database: name }, reset: true, seed });
  const pool = createPool({ database: name, connectionLimit: 5 });

  return {
    name,
    pool,
    async drop() {
      await pool.end();
      const { database: _ignored, ...serverConfig } = base;
      const conn = await mysql.createConnection(serverConfig);
      try {
        await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
      } finally {
        await conn.end();
      }
    },
  };
}

/** Assert that a query is rejected by MySQL with the given error code. */
async function assertDbError(promise, code, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, code, message || `expected ${code}, got ${err.code}: ${err.sqlMessage}`);
    return true;
  });
}

module.exports = { createTestDatabase, assertDbError };
