# Database (story #13)

MySQL 8.0.16+ (InnoDB, utf8mb4). One schema file, one optional sample-data file, one setup script. **This is the single shared schema** for Varchas, Vrinda and Uditi: please add what you need here (and tell the others) instead of creating tables of your own.

| File | Purpose |
|---|---|
| `schema.sql` | All tables, keys, constraints and indexes |
| `seed.sql` | Optional sample data for local demos (25 public-domain books, 7 categories, 3 demo accounts, one ready cart) |
| `setup.js` | Creates the database, applies `schema.sql`, optionally loads `seed.sql` |
| `../src/config/database.js` | `createDatabasePool()` – the connection pool every feature should share |

## Set up

```bash
cd backend
npm install
cp .env.example .env        # then fill in DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
npm run db:setup            # create the database if missing and apply the schema (does nothing if it already exists)
npm run db:setup -- --seed  # ...and load the sample data (only into a database that has no tables yet)
npm run db:reset            # DROP the database, recreate it, apply schema + sample data (refused when NODE_ENV=production)
```

The npm scripts read `backend/.env` with `node --env-file=.env` (the application itself still does not load `.env` automatically – start it with `node --env-file=.env src/server.js` or set the variables in the shell). The database user needs `CREATE`/`DROP` on `DB_NAME` for the setup script; the running application only needs `SELECT, INSERT, UPDATE, DELETE`.

To sign in with the three demo accounts, set `SEED_DEMO_PASSWORD` (8–200 characters) before `db:reset`. The seed file contains **no passwords**; the script stores a bcrypt hash of that value. Never set it on a real deployment, and never load the sample data into one.

| Variable | Meaning |
|---|---|
| `DB_HOST`, `DB_PORT` | MySQL server (defaults `localhost`, `3306`) |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Database and credentials (placeholders only in `.env.example`) |
| `DB_POOL_SIZE` | Optional pool size (default 10) |
| `SEED_DEMO_PASSWORD` | Optional, local demos only |

There is no migration framework: the schema is one reviewed file. During development change `schema.sql` and run `npm run db:reset`; once real data exists, ship an `ALTER` script next to it and keep `schema.sql` equal to the end result.

## Tables

```
users ──< carts ──< cart_items >── books >── categories
  │                                  │ ╲
  │                                  │  inventory (1:1)  ──< inventory_adjustments
  ├──< delivery_details (1:1)        │
  └──< orders ──< order_items >──────┘
         ├──< order_status_history
         └──< payments
sessions (stand-alone, for a persistent express-session store)
```

| Table | Rows are | Written by | Key rules |
|---|---|---|---|
| `users` | customer and administrator accounts | Vrinda (registration/profile); Varchas reads for login | `email` unique (case-insensitive), `role` ∈ `customer`, `admin`, `password_hash` only (bcrypt – never plain text), `terms_accepted_at` required |
| `sessions` | login sessions (layout of `express-mysql-session`) | session store | PK `session_id`, index on `expires` |
| `categories` | book categories | Varchas (catalogue admin) | `name` unique |
| `books` | catalogue entries | Varchas (catalogue admin) | `isbn` unique, ISBN-10/13 **without hyphens** (CHECK), `price >= 0` (DECIMAL(10,2), INR), `is_active = 0` hides a book without breaking old orders – **soft delete, never `DELETE` a book that was ever ordered** (FK `RESTRICT`) |
| `inventory` | exactly one row per book | Uditi (`inventory.service.js`) | `quantity >= 0` (CHECK – overselling is impossible even if code is wrong); removed with its book |
| `inventory_adjustments` | audit of manual stock changes | Uditi | who, which book, before → after, reason |
| `carts`, `cart_items` | one cart per user; one line per book | Vrinda | `user_id` unique, `quantity > 0`, PK `(cart_id, book_id)`; **no prices stored** – the current catalogue price is read at checkout |
| `delivery_details` | the delivery form a user last saved (1 per user) | Uditi (checkout) | copied into the order when it is placed |
| `orders` | one per order | Vrinda | `order_number` unique and 4–32 of `A-Z a-z 0-9 -` (the customer-facing Order ID), `total_amount >= 0`, delivery snapshot columns, `(user_id, idempotency_key)` unique so a retried "create order" cannot create two orders |
| `order_items` | books of an order | Vrinda | unique `(order_id, book_id)`, `quantity > 0`, **`unit_price` and `book_title` are snapshots** (a later price change never alters an order) |
| `order_status_history` | every status change | Vrinda | `from_status` NULL for the first entry, `changed_by` NULL = system |
| `payments` | one row per payment **attempt** | Varchas | see below |

Orders and payments are never cascade-deleted with their user or books (`ON DELETE RESTRICT`). Carts, cart items, delivery details and inventory are removed with their owner.

### Status values

* **`orders.status`**: `pending → paid → confirmed → processing → shipped → delivered`; `pending → payment_failed → pending` (customer retries payment); `cancelled` (allowed before shipping). The database restricts the *values*; the order service (Vrinda) enforces the *transitions* and writes `order_status_history`.
* **`payments.status`**: `pending`, `succeeded`, `failed`, `cancelled`, `timed_out` – exactly the outcomes the payment feature uses.

### Payment guarantees the database enforces

* `idempotency_key` is **globally unique** – a retried payment request can only ever create one attempt.
* At most **one `pending`** attempt per order, and at most **one `succeeded`** payment per order (STORED generated columns `active_order_id` / `succeeded_order_id` with unique keys). An order can never be paid twice; a new attempt is allowed once the previous one is `failed`, `cancelled` or `timed_out`.
* `provider_reference` (the provider's id, never card data) is unique when present; `amount > 0`.
* No card numbers, CVV or expiry are stored anywhere (SEC-7).

## Data contract

**Types.** Ids are `BIGINT UNSIGNED` (categories: `INT UNSIGNED`). Money is `DECIMAL`; `createDatabasePool()` sets `decimalNumbers: true` so mysql2 returns JS numbers – add up money in whole paise (see `src/features/uditi/shared/money.js`), never by summing floats. Currency is INR (`orders.currency` / `payments.currency` record it explicitly). Timestamps are `TIMESTAMP`/`DATETIME` in the server's UTC.

**Everyone should**

1. Use parameterized queries (`?` placeholders) – never build SQL from request data.
2. Change several rows that belong together inside one transaction – `withTransaction(pool, async connection => { … })` from `src/features/uditi/shared/transaction.js` commits on return and rolls back on throw.
3. Change stock **only** through `deductStock` / `restoreStock` (and the admin `setStock` / `adjustStock`) in `src/features/uditi/inventory/inventory.service.js`; never `UPDATE inventory` by hand. `deductStock` is one guarded `UPDATE … WHERE quantity >= ?`, all-or-nothing per call and safe under concurrent buyers.
4. Never delete users, books, orders or payments that are referenced; deactivate instead.
5. Not invent parallel tables for carts, orders, payments or users.

**Suggested purchase flow** (agree the exact sequence between Vrinda and Varchas; both variants are supported by the inventory functions):

1. Checkout (`GET /api/checkout/summary`) re-reads prices and checks stock, read-only.
2. Order created (Vrinda), in one transaction: re-check, insert `orders` (+ `order_items` with price/title snapshots, delivery copied from `delivery_details`, `order_status_history` first row). Order total = sum of the snapshot prices.
3. Payment attempt (Varchas) against `orders.id` with the server-side `total_amount`.
4. When the provider confirms success, **in one transaction**: `deductStock(connection, items)` → mark payment `succeeded` → order `paid` → history row. If stock ran out in the meantime `deductStock` throws `InsufficientStockError` (HTTP 409) and everything rolls back, so the payment must be refunded/voided by the payment feature. (If the team prefers to reserve stock when the order is created, call `deductStock` in step 2 and `restoreStock` on `payment_failed`/`cancelled`; the functions work either way.)
5. Cancelling an unshipped order calls `restoreStock` in the cancellation transaction (BR-2).

### Field mapping for Varchas's adapters (`backend/src/features/varchas/README.md`)

| Adapter field | Column |
|---|---|
| `users.*` → `id`, `name`, `email`, `role`, `passwordHash` | `users.id`, `name`, `email`, `role`, `password_hash` |
| `books.*` → `id`, `title`, `author`, `isbn`, `category`, `description`, `price`, `coverImageUrl` | `books.id`, `title`, `author`, `isbn`, `categories.name` (join on `category_id`), `description`, `price`, `cover_image_url` |
| book stock | `inventory.quantity` (by `book_id`) – not a column of `books`; the catalogue admin must create the `inventory` row together with a new book |
| `orders.getPayableOrder` → `id`, `customerId`, `amount`, `currency`, `status` | `orders.id`, `user_id`, `total_amount`, `currency`, `status` (filter by `user_id` for ownership) |
| `payments.createPending({ idempotencyKey, orderId, customerId, amount, currency })` | `payments.idempotency_key`, `order_id`, `user_id`, `amount`, `currency`; a duplicate key / second pending attempt raises `ER_DUP_ENTRY` – catch it and return the existing attempt |
| `payments.updateStatus(id, status, providerReference)` | `payments.status`, `provider_reference` (conditional `WHERE id = ? AND status = 'pending'` keeps transitions atomic) |

`sessions` has the layout `express-mysql-session` expects, so a persistent store can be plugged in later (`createUditiRouter` does not use it).

## Tests

`npm test` in `backend/` includes `test/uditi/schema.test.js` (every constraint above, the setup script, the seed data). It creates and drops a throw-away database named `bookstore_test_*` using the `DB_*` settings, so that user needs `CREATE`/`DROP`. If MySQL is not reachable those tests are skipped with the reason shown.
