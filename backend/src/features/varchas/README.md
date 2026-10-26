# Varchas feature integration contract

This area implements Varchas authentication, book-detail, payment, and admin routes. `src/server.js` creates the shared MySQL pool and a parameterized user repository when `DB_NAME` and `DB_USER` are configured; login and authorization use that repository. Book, order, and payment repositories still depend on the adapter contract below. Unconfigured dependencies fail closed with HTTP 503.

## Repository/service adapters

Pass these adapters to `createApp({ repositories, sessionSecret, sessionStore })` in `src/app.js`. For server startup, `VARCHAS_ADAPTER_MODULE` may point to an absolute or working-directory-relative JavaScript module exporting `createVarchasAdapters()` that returns `{ repositories, sessionStore }`:

```js
{
  users: {
    findByEmail(email), // { id, name, email, role, passwordHash } | null
    findById(id)        // same fields; role is read on every protected request
  },
  books: {
    findById(id), list(), create(book), update(id, patch), deleteOrDeactivate(id)
  },
  orders: {
    getPayableOrder(orderId, customerId), // { id, customerId, amount, currency, status } | null
    recordPaymentStatus({ orderId, customerId, paymentId, paymentStatus })
  },
  payments: {
    findByIdempotencyKey(key), findById(id),
    createPending({ idempotencyKey, orderId, customerId, amount, currency }),
    updateStatus(id, status, providerReference)
  }
}
```

Database adapters must use parameterized queries, hash customer passwords with the exported `hashPassword` helper, enforce uniqueness of payment idempotency keys atomically, and preserve the database contract owned by Uditi. `createPending` must be transactional: re-check the order amount/status and prevent concurrent active attempts for one order while allowing a new attempt after a terminal decline/cancellation/timeout. It must enforce unique idempotency keys across processes. `updateStatus` must make conditional transitions atomic and return the final persisted attempt. `deleteOrDeactivate` must preserve referential-integrity rules. `getPayableOrder` must verify ownership and return the server-calculated amount; the browser never supplies an amount. `recordPaymentStatus` delegates consistency with order state to Vrinda's order service. Financial credentials are never accepted or sent; checkout outcomes are generated internally and never contact a payment provider.

When MySQL is configured, development uses the built-in `MySqlSessionStore` over the shared pool and the `sessions` table in `database/schema.sql`; startup fails if a non-test server has neither MySQL configuration nor an adapter-provided persistent `sessionStore`. The schema's `session_id`, `expires`, and `data` columns match the store implementation. Production still requires `SESSION_SECRET` and `VARCHAS_ADAPTER_MODULE` with a persistent `sessionStore`. Local Vite requests proxy `/api` to port 5000, keeping the session cookie same-origin. Without DB configuration, login and registration are unavailable; without the adapter, book, payment, and admin database endpoints remain unavailable.

## Endpoints

| Method | Path | Access | Contract |
|---|---|---|---|
| POST | `/api/auth/login` | Public, rate limited | `{ email, password }`; creates an HTTP-only server session |
| POST | `/api/auth/logout` | Public | Destroys the current session |
| GET | `/api/auth/me` | Customer or admin | Returns the current public user |
| GET | `/api/books/:bookId` | Public | Returns one book or 404 |
| GET | `/api/admin/books` | Admin | Lists books |
| POST | `/api/admin/books` | Admin | Creates book details |
| PATCH | `/api/admin/books/:bookId` | Admin | Updates book details |
| DELETE | `/api/admin/books/:bookId` | Admin | Deletes or deactivates via repository policy |
| POST | `/api/payments/orders/:orderId` | Authenticated owner | Requires `Idempotency-Key`; server checks order owner and amount |
| GET | `/api/payments/:paymentId` | Authenticated owner | Reads attempt status |
| POST | `/api/payments/:paymentId/cancel` | Authenticated owner | Cancels a pending checkout attempt |

Payment outcomes are `succeeded`, `failed`, `cancelled`, or `timed_out`. Internal checkout uses `FOLIO_CHECKOUT_OUTCOME` (`approved`, `declined`, `cancelled`, or `timeout`) to exercise these order paths. It has no gateway integration, accepts no financial credentials, and never transfers money. This setting is for local flow verification and administrative diagnostics; customer screens describe the order outcome without claiming funds were collected.

## Cross-member dependencies

- **Uditi:** database schema/connection, user and book repository field mapping, transaction/idempotency uniqueness, persistent session storage integration.
- **Vrinda/Uditi:** the cart and catalogue schema use numeric `books.id` values, while the live Open Library detail route uses provider work IDs such as `works/OL123W`. Map/associate provider works to actual store book rows before enabling Add to Cart from live detail results; do not send provider IDs directly to the cart.
