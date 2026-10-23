/**
 * Create the database and apply schema.sql (and optionally seed.sql).
 *
 *   npm run db:setup                  create the database if missing, apply the schema if empty
 *   npm run db:setup -- --seed        ...and load the sample data
 *   npm run db:reset                  DROP the database, recreate it, apply schema + sample data
 *
 * Connection settings come from backend/.env (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD,
 * DB_NAME); the npm scripts load that file with `node --env-file`. --reset is refused
 * when NODE_ENV=production.
 *
 * To be able to sign in with the demo accounts, also set SEED_DEMO_PASSWORD (8-200
 * characters). The seed data holds no password; this script stores a bcrypt hash of
 * the value for the three demo accounts, and only when --seed is used.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { databaseConfigFromEnv } from '../src/config/database.js';

const SCHEMA_FILE = fileURLToPath(new URL('./schema.sql', import.meta.url));
const SEED_FILE = fileURLToPath(new URL('./seed.sql', import.meta.url));

function assertSafeName(name) {
  // The name is used as an identifier, which cannot be a bound parameter.
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name || '')) {
    throw new Error('DB_NAME must be 1-64 characters: letters, digits or underscore.');
  }
}

/**
 * @param {object}  options
 * @param {object}  options.config        { host, port, user, password, database }
 * @param {boolean} [options.reset]       drop the database first
 * @param {boolean} [options.seed]        load seed.sql after the schema
 * @param {string}  [options.demoPassword] password for the demo accounts (with seed)
 * @returns {Promise<{ schemaApplied: boolean, seeded: boolean }>}
 */
export async function setupDatabase({ config, reset = false, seed = false, demoPassword }) {
  const { database, ...serverConfig } = config;
  assertSafeName(database);
  if (demoPassword !== undefined && (demoPassword.length < 8 || demoPassword.length > 200)) {
    throw new Error('SEED_DEMO_PASSWORD must be 8-200 characters.');
  }

  const connection = await mysql.createConnection({ ...serverConfig, multipleStatements: true });
  try {
    if (reset) await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await connection.query(`USE \`${database}\``);

    const [tables] = await connection.query("SHOW TABLES LIKE 'books'");
    const alreadyHasSchema = tables.length > 0;

    if (!alreadyHasSchema) await connection.query(await readFile(SCHEMA_FILE, 'utf8'));

    let seeded = false;
    if (seed) {
      if (alreadyHasSchema) {
        throw new Error(`Database "${database}" already has tables; refusing to load sample data into it. Use "npm run db:reset" to start from scratch.`);
      }
      await connection.query(await readFile(SEED_FILE, 'utf8'));
      if (demoPassword) {
        await connection.query("UPDATE users SET password_hash = ? WHERE password_hash LIKE '!%'", [await bcrypt.hash(demoPassword, 12)]);
      }
      seeded = true;
    }
    return { schemaApplied: !alreadyHasSchema, seeded };
  } finally {
    await connection.end();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const reset = args.has('--reset');
  const seed = args.has('--seed') || reset;

  if (reset && process.env.NODE_ENV === 'production') throw new Error('Refusing to --reset a production database.');

  const config = databaseConfigFromEnv();
  const result = await setupDatabase({ config, reset, seed, demoPassword: process.env.SEED_DEMO_PASSWORD || undefined });

  if (result.schemaApplied) {
    console.log(`Database "${config.database}" ready: schema applied${result.seeded ? ' + sample data loaded' : ''}.`);
    if (result.seeded && !process.env.SEED_DEMO_PASSWORD) console.log('Demo accounts cannot sign in (set SEED_DEMO_PASSWORD to enable that).');
  } else {
    console.log(`Database "${config.database}" already has the schema - nothing to do.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`db:setup failed: ${error.message}`);
    process.exit(1);
  });
}
