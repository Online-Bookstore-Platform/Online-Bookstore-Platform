# Vrinda backend features

This module implements customer registration/profile (#4), the persistent cart (#6), order creation/history (#9), and read-only tracking (#12). It uses the shared tables in `backend/database/schema.sql`; it does not create tables or use a browser/local-only cart.

## Integration

`createVrindaRouter({ pool, requireAuth })` returns an Express router for mounting under `/api`. Supply the existing MySQL pool and Varchas `requireAuth` middleware. Missing dependencies fail closed with HTTP 503. The router is intentionally not mounted from `src/app.js`, which remains integration-owned.

```js
import { createAuthMiddleware } from './features/varchas/authentication/auth.middleware.js';
import { createVrindaRouter, createVrindaOrderService } from './features/vrinda/index.js';

const auth = createAuthMiddleware(repositories.users);
app.use('/api', createVrindaRouter({ pool, requireAuth: auth.requireAuth }));

// When assembling Varchas's payment adapters, use this order-service contract:
const vrindaOrders = createVrindaOrderService({ pool });
const paymentRepositories = {
  ...repositories,
  orders: { ...repositories.orders, ...vrindaOrders },
};
```

Registration hashes passwords with Varchas's `hashPassword` helper and writes the shared `users` table. It does not create a separate login/session system; newly registered customers sign in through `/api/auth/login`. Profile, cart, and order routes use the injected Varchas session middleware and always scope reads/writes to `request.user.id`.

Varchas's payment repository should use `createVrindaOrderService` for `orders.getPayableOrder(orderId, customerId)` and `orders.recordPaymentStatus({ orderId, customerId, paymentId, paymentStatus })`. A confirmed payment is recorded with an atomic order/status-history transaction and Uditi's `deductStock`; failed, cancelled, or timed-out attempts transition a payable order to `payment_failed`. A stock shortage after provider approval is thrown to the payment integration for its refund/reconciliation policy; this feature does not pretend the order was paid or implement a payment provider.

Order drafting checks stock with Uditi's `checkAvailability` but does not reserve or deduct inventory. Prices and book titles are read from the database and snapshotted into `order_items`; payment confirmation is the point where Uditi's inventory service deducts the stock. Customer-facing tracking is read-only: customers cannot set payment, shipping, delivery, or cancellation states.

## Endpoints

| Method | Path | Access | Contract |
|---|---|---|---|
| `POST` | `/api/users/register` | Public, rate limited | `{ name, email, phone?, password, confirmPassword, acceptedTerms: true }` → `201 { user }`; uniqueness is enforced by the shared database |
| `GET` | `/api/profile` | Signed in | `{ user: { id, name, email, phone, role } }` |
| `PATCH` | `/api/profile` | Signed in | Update one or more of `name`, `email`, `phone`; password and role are not editable here |
| `GET` | `/api/cart` | Signed in | `{ cart: { items, itemCount, totals } }`; item prices and stock are read from the catalogue |
| `POST` | `/api/cart/items` | Signed in | `{ bookId, quantity? }`; increments that customer's existing line and checks current stock |
| `PATCH` | `/api/cart/items/:itemId` | Signed in | `{ quantity }`; `itemId` is the book ID because the shared cart key is `(cart_id, book_id)` |
| `DELETE` | `/api/cart/items/:itemId` | Signed in | Removes only the signed-in customer's line |
| `POST` | `/api/orders/draft` | Signed in | `{ delivery }` (or previously saved checkout delivery) → `201 { order }`, pending payment |
| `POST` | `/api/orders` | Signed in | Compatibility alias for the current Uditi checkout client |
| `GET` | `/api/orders` | Signed in | Current customer's order history |
| `GET` | `/api/orders/:orderId` | Signed in | Customer-owned order, immutable item snapshots, delivery snapshot, status history |
| `GET` | `/api/orders/:orderId/tracking` | Signed in | Customer-owned current status and status-history timeline |

An optional `Idempotency-Key` on order creation is unique per user. The client should reuse the same key when retrying a draft request. Successful draft creation stores an initial `pending` history entry and clears the cart in the same transaction. All database statements are parameterized; monetary totals are calculated from database prices in integer paise.

## Tests

`npm test` from `backend/` includes `test/vrinda/*.test.js` for registration/profile validation, cart quantity/stock rules, order snapshots, ownership scoping, and payment-to-order stock/status integration. The repository's existing schema tests may skip when a local MySQL server is unavailable.
