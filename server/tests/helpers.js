'use strict';

const path = require('node:path');
const http = require('node:http');
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

/**
 * Start the real Express app on a random local port, backed by `pool`.
 * Returns a tiny JSON client: `api.get('/api/books?q=austen')`.
 */
async function startTestServer(pool, { allowDevAuth = true } = {}) {
  const { createApp } = require('../app');
  const server = await new Promise((resolve) => {
    const s = http.createServer(createApp({ pool, allowDevAuth })).listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, urlPath, body, headers = {}) {
    const res = await fetch(baseUrl + urlPath, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  return {
    baseUrl,
    get: (p, headers) => request('GET', p, undefined, headers),
    post: (p, body, headers) => request('POST', p, body, headers),
    put: (p, body, headers) => request('PUT', p, body, headers),
    patch: (p, body, headers) => request('PATCH', p, body, headers),
    delete: (p, headers) => request('DELETE', p, undefined, headers),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Assert that a query is rejected by MySQL with the given error code. */
async function assertDbError(promise, code, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, code, message || `expected ${code}, got ${err.code}: ${err.sqlMessage}`);
    return true;
  });
}

module.exports = { createTestDatabase, startTestServer, assertDbError };
