# Architecture

Folio is a three-tier client/server application, as described in the SAD (layered architecture): a React single-page application in the browser, an Express REST API, and a MySQL 8 database. The backend also calls two external book-discovery services (Open Library, with Google Books as fallback) and Gmail SMTP for one-time codes and order emails.

```
Browser (React + Vite)  --HTTP/JSON-->  Express API (Node.js)  --SQL-->  MySQL 8
                                              |--HTTPS--> Open Library / Google Books
                                              |--SMTP---> Gmail (OTP and order emails)
```

## Frontend

The Vite frontend owns shared layout, route composition (`src/app/router.jsx`), design tokens and the static pages. Each team member has a feature folder under `src/features/<owner>/`; route declarations, shared components and global styles are integration-owned. The shared layout wraps every route in one navigation bar and footer, with category-specific backgrounds and light/dark themes. Unknown paths render a not-found page. Locally, Vite proxies `/api` to the backend, so the browser and API share one origin.

## Backend

The backend separates application wiring (`src/app.js`, `createApp`) from process startup (`src/server.js`), so the system tests can boot the exact production wiring on a throw-away database.

`createApp` mounts, in order:

| Mount | Owner | Responsibility |
|---|---|---|
| `GET /api/health` | Integration | Liveness check |
| `/api/catalogue` | Uditi | Live discovery (Open Library → Google Books → store fallback), search, filters, ratings |
| `/api/contact` | Varchas | Contact-form submissions |
| `/api` (Varchas router) | Varchas | Authentication and sessions, password reset by OTP, book details, administrator catalogue, payments with simulated OTP |
| `/api/books/:id/reviews` | Varchas | Customer reviews |
| `/api` (Vrinda router) | Vrinda | Registration/profile, cart, orders, cancellation, tracking, administrator order management |
| `/api` (Uditi router) | Uditi | Checkout summary and delivery details, inventory and stock administration |

Every feature follows the same layering: `*.validation.js` (input checking) → `*.repository.js` (parameterized SQL) → `*.service.js` (business rules) → `*.routes.js` (HTTP). Routes fail closed: if the database or an auth dependency is not configured they answer HTTP 503 instead of using in-memory data. All errors use one shape, `{ "error": { "code", "message", "details"? } }`, and internal errors never reach the client.

`server.js` creates the MySQL pool from the `DB_*` variables, a MySQL-backed session store, and MySQL repositories for users, books, payments, payment OTPs and orders. An optional `VARCHAS_ADAPTER_MODULE` can replace those repositories.

## Data

The schema is `backend/database/schema.sql`, with additive changes in `backend/database/migrations/` (see their READMEs). Integrity rules live in the database as well as in code: foreign keys between users, books, carts, orders, order items and payments; `CHECK (quantity >= 0)` on inventory; price and title snapshots in `order_items`; an audit trail in `inventory_adjustments` and `order_status_history`. Multi-row changes such as payment, stock deduction and order status run in one transaction (`features/uditi/shared/transaction.js`), which retries MySQL deadlock victims.

## Security

Passwords are hashed with bcrypt; sessions are server-side with HttpOnly, SameSite=Strict cookies (Secure in production); administrator routes check the role; login, registration and catalogue are rate-limited; no card data is accepted or stored. HTTPS/TLS and security headers are left to the deployment's reverse proxy (DEF-09).

## UI

The UI is responsive and accessible: semantic landmarks, visible focus states, labelled form controls, reduced-motion support and light/dark themes.
