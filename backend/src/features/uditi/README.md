# Uditi backend: catalogue (#3), checkout (#7), inventory (#10)

Database schema and connection (#13) are in [`backend/database/`](../../../database/README.md) and `src/config/database.js`.

```
uditi/
  index.js              createUditiRouter({ pool, requireAuth, requireAdmin, cartReader }) + helpers other features may import
  catalogue/            GET books (search/filter/sort/paginate), GET filter options
  inventory/            availability, validation, stock rules (deduct/restore), administrator stock screen
  checkout/             cart review + order summary, delivery details
  shared/               errors, transactions, money, query/search helpers
```

Each feature is split the same way: `*.validation.js` (query/body checking) → `*.repository.js` (parameterized SQL only) → `*.service.js` (rules) → `*.routes.js` (HTTP).

## Mounting (integration owner)

This module is **not** registered in `src/app.js` – that file belongs to the integration owner. To connect it:

```js
import { createDatabasePool } from './config/database.js';
import { createUditiRouter, createDatabaseCartReader } from './features/uditi/index.js';

const pool = createDatabasePool();                       // reads DB_* from the environment
const auth = createAuthMiddleware(users);                // Varchas's src/features/varchas/authentication
app.use('/api', createUditiRouter({
  pool,
  requireAuth: auth.requireAuth,
  requireAdmin: auth.requireAdmin,
  cartReader: createDatabaseCartReader(pool),            // or Vrinda's cart service, see "Cart contract"
}));
```

The router has its own final error handler so it can return field-level `details`; anything it does not recognise falls through to the app's error handler. It **fails closed**: with no `pool` every route answers `503 DEPENDENCY_NOT_CONFIGURED`; with no `requireAuth`/`requireAdmin` the inventory and checkout routes answer 503 (they are never left open); without a `cartReader` the checkout summary answers 503. If MySQL is down the routes answer `503 DATABASE_UNAVAILABLE`.

All errors use the project shape `{ "error": { "code", "message", "details"? } }`. `details` is a list of `{ field, message }` for validation errors, or the list of short books for stock errors.

## Endpoints

### Catalogue – public, read-only

| Method & path | Notes |
|---|---|
| `GET /api/catalogue/books` | `?q` search words (all must match title, author, category name or the start of the ISBN, hyphens allowed) · `?category=1,2` · `?author=` · `?minPrice` `?maxPrice` · `?availability=all\|in_stock\|out_of_stock` · `?sort=title\|author\|price\|newest` `?order=asc\|desc` · `?page` `?pageSize` (default 12, max 50) |
| `GET /api/catalogue/filters` | `{ filters: { categories:[{id,name,bookCount}], authors, authorsTruncated, priceRange:{min,max} } }` |

`GET /books` → `{ books:[{ id, isbn, title, author, category, categoryId, price, currency:"INR", coverImageUrl, stockStatus:"in_stock\|low_stock\|out_of_stock", available }], pagination:{ page, pageSize, totalItems, totalPages } }`. Field names follow Varchas's book-details DTO. Only active books are listed; customers get the availability label, never exact quantities. Invalid parameters answer `400 VALIDATION_ERROR` with every problem in `details`. Sorting is whitelisted (user input only picks a key); ties are broken by id so pages never repeat a book.

> The path is `/api/catalogue/*` (not `/api/books`) so it cannot clash with Varchas's `GET /api/books/:bookId`.

### Inventory

| Method & path | Access | Notes |
|---|---|---|
| `GET /api/inventory/availability?bookIds=1,2,3` | public | `{ availability:[{ bookId, stockStatus, available }] }` |
| `POST /api/inventory/validate` | signed in | body `{ items:[{ bookId, quantity }] }` → `{ ok, shortages:[{ bookId, title, requested, available, message }] }`; invalid quantities (0, negative, fractions, text) → 400 |
| `GET /api/inventory/stock` | admin | exact stock, lowest first; `?q ?status=low\|out ?page ?pageSize` |
| `GET /api/inventory/stock/:bookId` | admin | one book |
| `PUT /api/inventory/stock/:bookId` | admin | `{ quantity, reason? }` – set an exact number (stock-take) |
| `PATCH /api/inventory/stock/:bookId` | admin | `{ change, reason? }` – add or remove copies; below zero → `409 STOCK_BELOW_ZERO` |

Administrator title/price/description editing is **not** here – that is Varchas's `/api/admin/books`. Uditi only owns the quantity.

**For the order and payment features** (import from `features/uditi/index.js`): `checkAvailability(db, items)` (read-only), `deductStock(connection, items)`, `restoreStock(connection, items)`, `InsufficientStockError` (`409 INSUFFICIENT_STOCK`, `details` lists each short book), `withTransaction(pool, work)`. `deductStock` must run inside the caller's transaction; it is one guarded `UPDATE … WHERE quantity >= ? AND is_active`, all-or-nothing, with books processed in id order so concurrent orders cannot deadlock. The `inventory.quantity >= 0` CHECK is the last line of defence. See the header of `inventory/inventory.service.js` and the purchase flow in the database README.

### Checkout – signed-in customers, always about the signed-in user's own cart

| Method & path | Notes |
|---|---|
| `GET /api/checkout/summary` | `{ checkout:{ items:[{ bookId, title, author, isbn, category, coverImageUrl, unitPrice, quantity, lineTotal, available, problem }], itemCount, totals:{ subtotal, total, currency }, stock:{ ok, shortages }, delivery, suggestedDelivery, canProceed } }` |
| `PUT /api/checkout/delivery` | body `{ recipientName, phone, addressLine1, addressLine2?, city, state, postalCode, country }` → `{ delivery }` (tidied: spaces collapsed, phone punctuation removed). 400 with one message per bad field; 409 `EMPTY_CART` |

Prices and availability are **re-read from the database on every call**; nothing from the cart or the browser is trusted. The SRS defines no delivery fee, tax or discount, so `total = subtotal`. `canProceed` is true only when the cart has books, every line can be supplied, and delivery details are saved. Responses are `Cache-Control: no-store` (personal data). Checkout never changes the cart, stock, orders or payments.

## Cart contract (needed from Vrinda)

Checkout needs only `cartReader.getItems(userId) → Promise<[{ bookId, quantity }]>` (empty array for an empty cart). Pass Vrinda's cart service as `cartReader` when it exists. Until then `createDatabaseCartReader(pool)` reads the shared `carts`/`cart_items` tables read-only, which is also exactly what Vrinda's cart API should be writing. If the reader is missing the summary returns 503 and if it returns unusable data, `502 CART_INVALID` – never an invented cart. The cart REST API itself (Vrinda) is called by the **browser**: the catalogue's *Add to cart* button posts `{ bookId, quantity: 1 }` to `POST /api/cart/items`, the same proposed contract Varchas's book-details page uses.

## Order-draft / payment hand-off (needed from Vrinda and Varchas)

Checkout stops at "ready to pay": the *Continue to payment* button re-checks the summary and then calls the order-draft endpoint. **No order-draft endpoint is documented in the repository yet**, so the frontend uses this proposal and shows a clear "order service not connected" message if it answers 404/503:

* `POST /api/orders` (Vrinda), body `{ delivery }` (the same object checkout saved), creating the order from the user's cart + saved delivery at current prices, returning `201 { order: { id, orderNumber, totalAmount, … } }`; it should use the `orders` / `order_items` / `order_status_history` tables.
* The browser then goes to Varchas's `/payment?orderId=<order.id>`, which calls `POST /api/payments/orders/:orderId`.

If the teams choose a different contract, only `frontend/src/features/uditi/checkout/api.js` changes.

## Missing integration pieces (nothing is faked)

* Repository adapters for Varchas's `users`, `books`, `orders`, `payments` (`createVarchasAdapters`) are **not** part of Uditi's scope; the field mapping to the shared tables is in the database README.
* `createUditiRouter` still has to be mounted in `src/app.js`, and `/catalogue`, `/checkout`, `/inventory` routes in the frontend router already point at Uditi's pages.
* `GET /api/auth/me` (Varchas) is used by the frontend to detect sign-in and the admin role.

## Tests

`npm test` in `backend/` runs `test/uditi/*.test.js` (schema constraints, catalogue search/filter/sort combinations and validation, inventory rules including concurrent buyers, checkout validation and stock problems, router fail-closed behaviour). They use a throw-away MySQL database and skip, with the reason shown, when MySQL is not reachable.
