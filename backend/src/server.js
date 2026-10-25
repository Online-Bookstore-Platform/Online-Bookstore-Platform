import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { createDatabasePool } from './config/database.js';
import { createMySqlSessionStore } from './features/varchas/mysql-session-store.js';
import { createMySqlBooksRepository } from './features/varchas/book-details/mysql-books.repository.js';
import { createMySqlPaymentsRepository } from './features/varchas/payments/mysql-payments.repository.js';
import { createVrindaOrderService } from './features/vrinda/orders/orders.service.js';

async function loadAdapters() {
  const modulePath = process.env.VARCHAS_ADAPTER_MODULE;
  if (!modulePath) return {};
  const moduleUrl = pathToFileURL(resolve(modulePath)).href;
  const adapterModule = await import(moduleUrl);
  return typeof adapterModule.createVarchasAdapters === 'function'
    ? adapterModule.createVarchasAdapters()
    : adapterModule.default;
}

const adapters = await loadAdapters();
if (process.env.NODE_ENV === 'production' && !adapters?.repositories) {
  throw new Error('Production requires a VARCHAS_ADAPTER_MODULE that provides repositories and a persistent sessionStore.');
}
const pool = process.env.DB_NAME && process.env.DB_USER ? createDatabasePool() : null;
const databaseUsers = pool ? {
  async findByEmail(email) {
    const [rows] = await pool.query('SELECT id, name, email, role, password_hash AS passwordHash FROM users WHERE email = ? LIMIT 1', [email]);
    return rows[0] ?? null;
  },
  async findById(id) {
    const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] ?? null;
  },
} : null;
const repositories = {
  ...(adapters?.repositories || {}),
  users: adapters?.repositories?.users || databaseUsers,
  books: adapters?.repositories?.books || (pool ? createMySqlBooksRepository(pool) : undefined),
  payments: adapters?.repositories?.payments || (pool ? createMySqlPaymentsRepository(pool) : undefined),
  orders: adapters?.repositories?.orders || (pool ? createVrindaOrderService({ pool }) : undefined),
};
const sessionStore = adapters?.sessionStore || (pool ? createMySqlSessionStore(pool) : null);
if (process.env.NODE_ENV !== 'test' && !sessionStore) {
  throw new Error('A persistent session store requires database configuration or a VARCHAS_ADAPTER_MODULE sessionStore.');
}
const app = createApp({ repositories, pool, sessionStore, sessionSecret: process.env.SESSION_SECRET });

const port = Number(process.env.PORT) || 5000;

app.listen(port, () => {
  console.log(`Online Bookstore API listening on port ${port}`);
});
