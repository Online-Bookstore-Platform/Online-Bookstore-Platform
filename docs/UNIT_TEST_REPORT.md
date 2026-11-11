# Unit Test Report — Online Bookstore (Folio)

| | |
|---|---|
| Project | Online Bookstore — Team 16 |
| Deliverable | SE Mini-Project Deliverables Part-3, item 2.b.i (Unit Test Report) |
| Tracking issue | #34 |
| Build under test | `main` at commit `f3c1198` (11 Nov 2026) |
| Test plan | `PES2UG24CS565_PES2UG24CS575_PES2UG24CS601_Online_Bookstore_STP.pdf`, §5.1 Unit Testing |
| Executed on | 11 November 2026 |
| Prepared by | Vrinda Venugopal M (PES2UG24CS601) |

## 1. Scope

This report covers module-level tests: individual services, validators, repositories and route
handlers tested in isolation or against a throw-away MySQL database. The end-to-end STP system
suite (`backend/test/system/stp.system.test.js`) is reported separately in
[`SYSTEM_VALIDATION_REPORT.md`](SYSTEM_VALIDATION_REPORT.md).

## 2. Environment

| Item | Version / setting |
|---|---|
| Runtime | Node.js 22 (built-in `node:test` runner) |
| Database | MySQL 8.0.33 (each DB-backed test creates and drops its own database) |
| Frontend tests | `node --test "src/**/*.test.js"` in `frontend/` |
| External services | Open Library / Google Books not reachable; tests use stubbed responses. Gmail not used; mail is captured by a test sink. |

## 3. Summary

| Suite | Test files | Tests | Pass | Fail | Known defect (todo) |
|---|---:|---:|---:|---:|---:|
| Backend module tests | 23 | 277 | 277 | 0 | 0 |
| Frontend module tests | 8 | 85 | 85 | 0 | 0 |
| **Total** | **31** | **362** | **362** | **0** | **0** |

**Result: PASS.** All 362 unit/module tests passed. No failures.

> Note on counting: running `npm test` with no file arguments reports one extra "test", because
> Node also loads the helper module `backend/test/uditi/helpers.js` as a test file. It contains no
> tests, so it is excluded from the counts above.

## 4. Backend results by test file

`Type` is **Unit** for tests that need no database, and **Unit + DB** for files that also run
repository/route tests against a temporary MySQL database.

| Test file | Feature (owner) | Type | Tests | Pass | Fail |
|---|---|---|---:|---:|---:|
| `test/uditi/catalogue.test.js` | Browse, search, filter, sort — SRS 5.2 (Uditi) | Unit + DB | 40 | 40 | 0 |
| `test/uditi/checkout.test.js` | Checkout and delivery — SRS 5.4 (Uditi) | Unit + DB | 49 | 49 | 0 |
| `test/uditi/inventory.test.js` | Inventory and stock validation — SRS 5.7, BR-1 (Uditi) | Unit + DB | 64 | 64 | 0 |
| `test/uditi/schema.test.js` | Database schema and integrity — DB-1 to DB-3 (Uditi) | Unit + DB | 52 | 52 | 0 |
| `test/uditi/presentation-store.test.js` | Catalogue presentation store (Uditi) | Unit | 4 | 4 | 0 |
| `test/uditi/presentation-store.mysql.integration.test.js` | Catalogue presentation store (Uditi) | Unit + DB | 3 | 3 | 0 |
| `test/uditi/book-ratings.mysql.integration.test.js` | Catalogue ratings from reviews (Uditi) | Unit + DB | 1 | 1 | 0 |
| `test/varchas.test.js` | Authentication, RBAC, book details, payments — SRS 5.1, 5.5, 5.8 (Varchas) | Unit | 10 | 10 | 0 |
| `test/varchas/email-service.test.js` | Email service (Varchas) | Unit | 6 | 6 | 0 |
| `test/varchas/mysql-books.repository.test.js` | Book repository (Varchas) | Unit | 3 | 3 | 0 |
| `test/varchas/mysql-session.integration.test.js` | Session store, logout — SEC-6 (Varchas) | Unit + DB | 1 | 1 | 0 |
| `test/varchas/open-library.test.js` | External catalogue provider (Varchas) | Unit | 14 | 14 | 0 |
| `test/varchas/order-confirmation.test.js` | Order confirmation email (Varchas) | Unit | 4 | 4 | 0 |
| `test/varchas/password-reset.test.js` | Password reset (Varchas) | Unit | 3 | 3 | 0 |
| `test/varchas/password-reset.mysql.integration.test.js` | Password reset persistence (Varchas) | Unit + DB | 1 | 1 | 0 |
| `test/varchas/payment-otp.mysql.integration.test.js` | Payment OTP cooldown, attempts, expiry — SRS 5.5 (Varchas) | Unit + DB | 1 | 1 | 0 |
| `test/varchas/reviews.routes.test.js` | Book reviews (Varchas) | Unit | 2 | 2 | 0 |
| `test/varchas/reviews.mysql.integration.test.js` | Book reviews persistence (Varchas) | Unit + DB | 1 | 1 | 0 |
| `test/vrinda/registration-profile.test.js` | Registration and profile — SRS 5.1 (Vrinda) | Unit | 3 | 3 | 0 |
| `test/vrinda/cart.test.js` | Shopping cart — SRS 5.3 (Vrinda) | Unit | 3 | 3 | 0 |
| `test/vrinda/orders.test.js` | Orders, history, tracking — SRS 5.6, 5.9 (Vrinda) | Unit | 6 | 6 | 0 |
| `test/vrinda/router.test.js` | Customer routes and access control (Vrinda) | Unit | 3 | 3 | 0 |
| `test/contact.routes.test.js` | Contact form (Varchas) | Unit + DB | 3 | 3 | 0 |
| **Backend total** | | | **277** | **277** | **0** |

## 5. Frontend results by test file

| Test file | Feature (owner) | Tests | Pass | Fail |
|---|---|---:|---:|---:|
| `src/features/uditi/catalogue/api.test.js` | Catalogue API client (Uditi) | 5 | 5 | 0 |
| `src/features/uditi/catalogue/catalogueParams.test.js` | Search/filter URL parameters (Uditi) | 18 | 18 | 0 |
| `src/features/uditi/catalogue/categories-assets.test.js` | Category artwork assets (Uditi) | 1 | 1 | 0 |
| `src/features/uditi/checkout/deliveryRules.test.js` | Delivery form validation (Uditi) | 33 | 33 | 0 |
| `src/features/uditi/checkout/summaryChanges.test.js` | Order summary change detection (Uditi) | 9 | 9 | 0 |
| `src/features/uditi/inventory/inventoryRules.test.js` | Stock adjustment rules (Uditi) | 9 | 9 | 0 |
| `src/features/uditi/shared/api.test.js` | Shared API client and errors (Uditi) | 9 | 9 | 0 |
| `src/layouts/backgrounds.test.js` | Category backgrounds (Varchas) | 1 | 1 | 0 |
| **Frontend total** | | **85** | **85** | **0** |

The frontend production build (`npm run build`) also completed successfully.

## 6. Observations

1. **No unit failures.** Every module test passed on the build under test.
2. **Uneven depth across modules.** Catalogue, checkout and inventory have 40–64 tests each, while
   cart, registration/profile and orders have 3–6 test cases each. These are covered further by
   the STP system suite, but the smaller unit suites are reflected in their lower branch coverage
   (see [`BRANCH_COVERAGE_REPORT.md`](BRANCH_COVERAGE_REPORT.md)).
3. **React components have no automated tests.** Frontend tests cover the plain JavaScript logic
   modules (validation, URL parameters, API clients). Pages and components (`*.jsx`) are verified
   manually through the demo walkthrough only. See [`CODE_COVERAGE_REPORT.md`](CODE_COVERAGE_REPORT.md).

## 7. How to reproduce

```bash
# Backend (needs MySQL; set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in backend/.env)
cd backend
npm ci
npm run db:setup
node --env-file=.env --test "test/uditi/*.test.js" "test/varchas/*.test.js" "test/vrinda/*.test.js" test/varchas.test.js test/contact.routes.test.js

# Frontend
cd frontend
npm ci
node --test "src/**/*.test.js"
npm run build
```
