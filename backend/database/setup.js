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
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { databaseConfigFromEnv } from '../src/config/database.js';

const SCHEMA_FILE = fileURLToPath(new URL('./schema.sql', import.meta.url));
const SEED_FILE = fileURLToPath(new URL('./seed.sql', import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
const MIGRATION_NAMES = [
  '20261024_create_book_reviews.sql',
  '20261025_allow_books_without_isbn.sql', '20261025_extend_book_reviews.sql',
  '20261026_add_openlibrary_work_id.sql', '20261027_create_presentation_products.sql',
  '20261028_create_password_reset_tokens.sql', '20261029_add_cod_orders.sql',
  '20261030_order_lifecycle_and_reset_otp.sql', '20261031_create_payment_otp_challenges.sql',
  '20261031_create_order_confirmation_email_deliveries.sql',
  '20261101_create_contact_submissions.sql',
];

async function applyExistingDatabaseMigrations(connection) {
  const hasTable = async name => (await connection.query('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1', [name]))[0].length > 0;
  const columns = async table => new Set((await connection.query(`SHOW COLUMNS FROM \`${table}\``))[0].map(column => column.Field));
  const apply = async file => connection.query(await readFile(join(MIGRATIONS_DIR, file), 'utf8'));
  const record = async file => connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [file]);

  if (!await hasTable('book_reviews')) await apply('20261024_create_book_reviews.sql');
  if (!(await columns('book_reviews')).has('local_book_id')) await apply('20261025_extend_book_reviews.sql');
  if (!(await columns('books')).has('open_library_work_id')) await apply('20261026_add_openlibrary_work_id.sql');
  if (!await hasTable('presentation_products')) await apply('20261027_create_presentation_products.sql');
  if (!await hasTable('password_reset_tokens')) await apply('20261028_create_password_reset_tokens.sql');
  if (!await hasTable('payment_otp_challenges')) await apply('20261031_create_payment_otp_challenges.sql');
  if (!await hasTable('order_confirmation_email_deliveries')) await apply('20261031_create_order_confirmation_email_deliveries.sql');
  if (!await hasTable('contact_submissions')) await apply('20261101_create_contact_submissions.sql');

  let orderColumns = await columns('orders');
  if (!orderColumns.has('payment_method')) await apply('20261029_add_cod_orders.sql');
  else if (!orderColumns.has('payment_status')) await connection.query("ALTER TABLE orders ADD COLUMN payment_status ENUM('pending', 'pending_collection', 'succeeded', 'failed') NOT NULL DEFAULT 'pending' AFTER payment_method");
  orderColumns = await columns('orders');

  const [[isbn]] = await connection.query("SHOW COLUMNS FROM books LIKE 'isbn'");
  if (isbn?.Null === 'NO') await connection.query('ALTER TABLE books MODIFY isbn VARCHAR(13) NULL');

  await connection.query(`ALTER TABLE orders
    MODIFY status ENUM('pending', 'pending_collection', 'payment_failed', 'paid', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned') NOT NULL DEFAULT 'pending',
    MODIFY payment_status ENUM('pending', 'pending_collection', 'succeeded', 'failed', 'collected') NOT NULL DEFAULT 'pending'`);
  if (!orderColumns.has('stock_reserved')) await connection.query('ALTER TABLE orders ADD COLUMN stock_reserved TINYINT(1) NOT NULL DEFAULT 0 AFTER payment_status');
  const resetColumns = await columns('password_reset_tokens');
  if (!resetColumns.has('otp_attempts')) await connection.query('ALTER TABLE password_reset_tokens ADD COLUMN otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0');

  for (const file of MIGRATION_NAMES) await record(file);
}

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

    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    if (!alreadyHasSchema) {
      for (const file of MIGRATION_NAMES) await connection.query('INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)', [file]);
    } else await applyExistingDatabaseMigrations(connection);

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
    console.log(`Database "${config.database}" schema checked; supported migrations are up to date.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`db:setup failed: ${error.message}`);
    process.exit(1);
  });
}
