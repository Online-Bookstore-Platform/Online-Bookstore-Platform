# Test Execution Report — Sprint 2 (Issue #25)

Functional, negative, regression and security testing of Folio (Online Bookstore Platform), executed
against the test cases in the Software Test Plan (`PES2UG24CS565_PES2UG24CS575_PES2UG24CS601_Online_Bookstore_STP.pdf`).

| | |
|---|---|
| Build under test | `main` @ `cfeb5a4`, plus the fixes in this branch (listed under *Fixes made during testing*) |
| Executed | 29 October 2026 |
| Executed by | Uditi Mourya (PES2UG24CS565) |
| Environment | Ubuntu 24.04, Node.js 22, MySQL 8.0.46, Chromium (Playwright) |
| How to re-run | `cd backend && npm test` (MySQL needed, see `backend/.env.example`); `cd frontend && node --test "src/**/*.test.js" && npm run build` |

## Summary

| Suite | Tests | Pass | Fail | Known defect (todo) |
|---|---:|---:|---:|---:|
| Backend: unit + integration + STP system tests (`npm test`) | 308 | 302 | 0 | 6 |
| Frontend: unit tests | 85 | 85 | 0 | 0 |
| Frontend production build (`npm run build`) | 1 | 1 | 0 | 0 |

The STP system tests are new: `backend/test/system/stp.system.test.js`. They start the whole application
exactly as `src/server.js` wires it (real sessions, real bcrypt, real MySQL transactions) on a throw-away
database, and each test is named after the STP case it executes. External book providers are switched
off inside the test, so the run is repeatable and needs no internet.

Known defects are written as `todo` tests: they assert what the SRS requires, run on every build, do not
block it, and start passing once the defect is fixed.

**Result: no critical or high-severity defect in the purchase path.** The purchase path covers sign-in,
catalogue, cart, checkout, payment, stock and order history. Two High defects remain: two SRS features
were never built (DEF-01, DEF-02).

## Execution record

`Pass` = executed and met the expected result. `Not run` = could not be executed in this environment (reason given).

### Customer accounts and security (SRS 5.1, SEC)

| STP case | What was checked | Result |
|---|---|---|
| TC-AUTH-01 | Valid registration creates a *customer* (never an admin) with a bcrypt hash; the customer can then sign in | Pass |
| TC-AUTH-01 (neg.) | Weak password, mismatched confirmation, terms not accepted, duplicate email are each refused; nothing is stored | Pass |
| TC-AUTH-02 | Wrong password and unknown email get the *same* 401 answer (no account enumeration); no cookie issued; SQL-injection login string refused | Pass |
| TC-AUTH-03 | Cart, orders, profile, checkout, payments, admin and inventory APIs all answer 401 without sign-in | Pass |
| SEC-5 | Session cookie is HttpOnly + SameSite=Strict; after logout the old cookie no longer works | Pass |
| SEC-1 | Login is rate-limited (10 / 15 min), registration (5 / 15 min), catalogue (45 / min) | Pass |
| SEC-1 | Search text is never run as SQL (`' OR 1=1 --`, `DROP TABLE`, `UNION SELECT`); no hash ever returned | Pass |
| SEC-7 | Raw card data in a payment request is refused (`PAYMENT_DATA_NOT_ACCEPTED`); the schema has no card/CVV columns | Pass |
| SEC-8 | A customer gets 403 on every admin book and stock route and changes nothing; customers cannot read, change or pay each other's carts/orders/payments (IDOR) | Pass |
| SEC | Error answers contain no stack traces or raw database errors; `X-Powered-By` is off | Pass (see DEF-03 for one exception) |
| SEC-2 | HTTPS / TLS in transit | Not run: needs the production host (cookie `secure` flag is already on when `NODE_ENV=production`) |

### Catalogue and search (SRS 5.2)

| STP case | What was checked | Result |
|---|---|---|
| TC-CAT-01 | Title search, partial and case-insensitive | Pass |
| TC-CAT-02 | Author search; ISBN search with and without hyphens | Pass |
| TC-CAT-03 | Category, price range, availability filters; sort by price/title; paging without repeats | Pass |
| TC-CAT-03 (neg.) | Negative price, unknown availability, category 99, sort by an unknown field, page 0, page size 500, 101-character search: each a clear 400 | Pass |
| TC-CAT-04 | Browsing while Open Library and Google Books are both down shows the store's own books with a notice (was an error page: fixed, see below) | Pass |
| TC-CAT-05 | Book details are public; unknown/removed book is a clean 404 | Pass |
| Live Open Library results | Not run: no internet access from the test machine; covered by mocked-provider tests in `test/varchas/open-library.test.js` | Not run |

### Cart, checkout, payment, orders, inventory (SRS 5.3–5.7, BR-1, BR-3)

| STP case | What was checked | Result |
|---|---|---|
| TC-CART-01 | Add to cart; price comes from the catalogue; adding again increases the same line | Pass |
| TC-CART-02 | Changing quantity recalculates the total; the cart is kept on the server across sessions | Pass |
| TC-CART-03 | Remove a line; removing something not in the cart is a 404 | Pass |
| TC-CART-04 | Quantity 0, −1, 1.5, text, 10²¹, unknown book, out-of-stock book, more than the stock: all refused, nothing added | Pass (message wording: DEF-04) |
| TC-CHK-01 | Delivery details validated, tidied (spaces, phone format) and saved | Pass |
| TC-CHK-02 | Order summary recalculated on the server; a price change is picked up | Pass |
| TC-CHK-03 | Every missing/invalid delivery field reported individually; empty cart cannot be checked out | Pass |
| TC-PAY-01 / TC-ORD-01 | Successful payment: order gets an id, becomes *paid*, amount = server-side total, cart cleared | Pass |
| TC-PAY-02 | Declined, cancelled and timed-out payments leave the order unpaid and stock untouched; the order can be paid later | Pass |
| TC-PAY-03 | Missing `Idempotency-Key` refused; the same request sent twice at once creates one payment; a paid order cannot be paid again; another customer cannot reuse the key | Pass (message wording: DEF-05) |
| TC-ORD-02 | Order history shows only the customer's own orders, newest first | Pass |
| TC-ORD-03 | Tracking shows the status timeline; cancellation | Pass for tracking. Cancellation **Fail** (DEF-01) |
| BR-3 | A later price change never changes an existing order | Pass |
| TC-INV-01 | Stock goes down by the quantity bought, only when payment succeeds | Pass |
| TC-INV-02 / BR-1 | Stock that runs out between checkout and payment blocks the purchase; nothing charged, nothing deducted | Pass |
| TC-INV-03 | Four customers buy the last copy at the same moment: all four get an order, exactly one payment succeeds, stock ends at 0, never negative | Pass (after fix DEF-07) |

### Administrator (SRS 5.8)

| STP case | What was checked | Result |
|---|---|---|
| TC-ADM-01 | Admin signs in and gets the admin role | Pass |
| TC-ADM-02 | Add / edit / re-price / remove a book; missing fields and zero or negative price refused; a removed book leaves the catalogue but old orders still show it | Pass (duplicate ISBN: DEF-03) |
| TC-ADM-03 | Set an exact stock count, add/remove copies, below zero refused, every change audited with the admin's id | Pass |
| TC-ADM-03 | View customer orders and update their status | **Fail**: not implemented (DEF-02) |

### Non-functional (spot checks on one machine)

| STP case | What was checked | Result |
|---|---|---|
| PERF-1 | A catalogue search answers within 2 s | Pass |
| PERF-1 | 10 simultaneous searches during a provider outage within 2 s | **Fail** (DEF-06) |
| PERF-2 | Order + payment within 3 s | Pass |
| PERF-4 / SCAL | 100 simultaneous book-detail requests, all correct, well under 3 s | Pass |
| PERF / SCAL at 500 users | Not run: needs a load-testing host |
| REL (uptime, backup, recovery) | Not run: needs the deployment environment |
| COMP (Firefox, Safari, Edge) | Not run: only Chromium is available; Chromium and mobile-width layouts were checked while recording the demo |
| UX | Customer and admin flows were walked through end to end in Chromium while recording the demo (`docs/demo/`) | Pass |

## Regression

The full existing suite (unit + integration tests written by all three members during Sprints 1–2) was
re-run after every change in this branch: 302 / 302 backend and 85 / 85 frontend tests pass, and the
frontend builds.

## Defect log

| ID | Severity | Area / owner | Defect | Steps / evidence | Status |
|---|---|---|---|---|---|
| DEF-01 | High | Orders (Vrinda) | A customer cannot cancel an order (SRS 5.6, BR-2): there is no cancel endpoint or button | `POST /api/orders/:id/cancel` → 404. Test `DEF-01` | Open, deferred: feature freeze |
| DEF-02 | High | Admin (Varchas) | No administrator order management: an admin cannot list orders or move them to Processing / Shipped / Delivered (SRS 5.8, 5.9) | `GET /api/admin/orders` → 404. Test `DEF-02` | Open, deferred: feature freeze |
| DEF-03 | Medium | Admin books (Varchas) | Adding a book with an ISBN that already exists answers **500** and the error code `ER_DUP_ENTRY` reaches the client | `POST /api/admin/books` with an existing ISBN. Test `DEF-03` | Open: small fix (map `ER_DUP_ENTRY` → 409 `DUPLICATE_ISBN`) |
| DEF-04 | Low | Cart (Vrinda) | Raising a cart quantity above the stock answers `BOOK_UNAVAILABLE` ("out of stock") even though copies are in stock; adding to cart correctly says `INSUFFICIENT_STOCK` | `PATCH /api/cart/items/:id {quantity: 50}` with 5 in stock. Test `DEF-04` | Open |
| DEF-05 | Low | Payments (Varchas) | Paying an order that is already paid answers 404 "order not found" instead of 409 "already paid". No double charge happens | Second `POST /api/payments/orders/:id`. Test `DEF-05` | Open |
| DEF-06 | Low | Catalogue (Uditi) | During an Open Library outage, requests to it are queued one per second (its usage policy), so 10 simultaneous searches take 10–20 s | Test `DEF-06` | Open: needs a short "provider is down" circuit breaker; deferred |
| DEF-07 | High | Orders / transactions (Uditi) | Several customers checking out the same book at the same moment got **500 `ER_LOCK_DEADLOCK`** for all but one | Test `TC-INV-03` | **Fixed**: `withTransaction` now re-runs a transaction MySQL chose as a deadlock victim (up to 3 times) |
| DEF-08 | Medium | Catalogue (Uditi) | Browsing the catalogue showed an error page whenever both book providers were unreachable | Test `TC-CAT-04` | **Fixed**: falls back to the store's own books with a notice |
| DEF-09 | Low | Platform | No security headers (CSP, HSTS, `X-Content-Type-Options`, frame protection) | Response headers of any page | Open: add `helmet` at deployment |
| DEF-10 | Low | Frontend tooling | `frontend/package.json` has no `test` script (tests run with `node --test "src/**/*.test.js"`) | — | Open |

## Fixes made during testing

* `backend/src/features/uditi/catalogue/open-library.js`, `frontend/src/features/uditi/catalogue/*`: fixes DEF-08.
* `backend/src/features/uditi/shared/transaction.js`: fixes DEF-07 (deadlock retry).
* `backend/test/system/stp.system.test.js`: the STP system test suite described above.
