'use strict';

/**
 * Create the database and apply database/schema.sql (and optionally seed.sql).
 *
 *   npm run db:setup                  create DB if missing, apply schema if empty
 *   npm run db:setup -- --seed        ...and load the sample data
 *   npm run db:reset                  DROP the database, recreate, schema + seed
 *
 * Connection settings come from server/.env (DB_HOST, DB_PORT, DB_USER,
 * DB_PASSWORD, DB_NAME). --reset is refused when NODE_ENV=production.
 */

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const DATABASE_DIR = path.resolve(__dirname, '..', '..', 'database');
const SCHEMA_FILE = path.join(DATABASE_DIR, 'schema.sql');
const SEED_FILE = path.join(DATABASE_DIR, 'seed.sql');

function assertSafeName(name) {
  // The name is used as an identifier, which cannot be a bound parameter.
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name || '')) {
    throw new Error('DB_NAME must be 1-64 characters: letters, digits or underscore.');
  }
}

/**
 * @param {object}  opts
 * @param {object}  opts.config  { host, port, user, password, database }
 * @param {boolean} [opts.reset] drop the database first
 * @param {boolean} [opts.seed]  load seed.sql after the schema
 * @returns {Promise<{ created: boolean, schemaApplied: boolean, seeded: boolean }>}
 */
async function setupDatabase({ config, reset = false, seed = false }) {
  const { database, ...serverConfig } = config;
  assertSafeName(database);

  const conn = await mysql.createConnection({ ...serverConfig, multipleStatements: true });
  try {
    if (reset) {
      await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
    }
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
    await conn.query(`USE \`${database}\``);

    const [tables] = await conn.query("SHOW TABLES LIKE 'books'");
    const alreadyHasSchema = tables.length > 0;

    let schemaApplied = false;
    if (!alreadyHasSchema) {
      await conn.query(fs.readFileSync(SCHEMA_FILE, 'utf8'));
      schemaApplied = true;
    }

    let seeded = false;
    if (seed) {
      if (alreadyHasSchema) {
        throw new Error(
          `Database "${database}" already has tables; refusing to load seed data into it. ` +
            'Use "npm run db:reset" to start from scratch.'
        );
      }
      await conn.query(fs.readFileSync(SEED_FILE, 'utf8'));
      seeded = true;
    }

    return { created: !alreadyHasSchema, schemaApplied, seeded };
  } finally {
    await conn.end();
  }
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
  const { dbConfigFromEnv } = require('../config/db');

  const args = new Set(process.argv.slice(2));
  const reset = args.has('--reset');
  const seed = args.has('--seed');

  if (reset && process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to --reset a production database.');
  }

  const config = dbConfigFromEnv();
  const result = await setupDatabase({ config, reset, seed });

  if (result.schemaApplied) {
    console.log(`Database "${config.database}" ready: schema applied${result.seeded ? ' + sample data loaded' : ''}.`);
  } else {
    console.log(`Database "${config.database}" already has the schema - nothing to do.`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`db-setup failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { setupDatabase };
