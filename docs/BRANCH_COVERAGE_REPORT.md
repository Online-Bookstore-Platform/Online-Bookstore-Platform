# Branch Coverage Report — Online Bookstore (Folio)

| | |
|---|---|
| Project | Online Bookstore — Team 16 |
| Deliverable | SE Mini-Project Deliverables Part-3, item 2.b.iv (Branch Coverage Report) |
| Tracking issue | #37 |
| Build under test | `main` at commit `f3c1198` (11 Nov 2026) |
| Tool | Node.js 22 built-in coverage (`node --test --experimental-test-coverage`) |
| Executed on | 11 November 2026 |
| Prepared by | Vrinda Venugopal M (PES2UG24CS601) |

Line and function coverage are reported in [`CODE_COVERAGE_REPORT.md`](CODE_COVERAGE_REPORT.md).

## 1. What was measured

**Branch coverage** is the share of decision outcomes that the tests exercised: each side of every
`if`/`else`, ternary `? :`, `&&` / `||` / `??` short-circuit, `switch` case, and `try`/`catch`. It is
stricter than line coverage, because a line can run while one of its outcomes is never tested.

Data comes from the same complete test runs as the code coverage report: 322 backend tests
(unit, integration and STP system tests against MySQL) and 85 frontend tests. Test files are
excluded. Only files loaded by the tests are measured; see the limitation in
`CODE_COVERAGE_REPORT.md` §1.

## 2. Summary

| Area | Branches covered | Branch coverage |
|---|---:|---:|
| Backend (59 files) | 1,499 / 1,839 | **81.5%** |
| Frontend logic modules (9 files) | 280 / 296 | **94.6%** |

For comparison, backend line coverage is 95.2%. The roughly 14-point gap means most backend code
runs during the tests, but about one in five decision outcomes (mostly error and edge-case paths)
is never taken.

## 3. Backend branch coverage by module

| Module | Folder owner | Branch coverage | Missed branches |
|---|---|---:|---:|
| `src/features/uditi/catalogue` | Uditi | 81.3% (475/584) | 109 |
| `src/features/uditi/checkout` | Uditi | 91.5% (107/117) | 10 |
| `src/features/uditi/inventory` | Uditi | 96.5% (195/202) | 7 |
| `src/features/uditi/shared` | Uditi | 97.2% (70/72) | 2 |
| `src/features/uditi` (index) | Uditi | 100.0% (12/12) | 0 |
| `src/features/varchas/authentication` | Varchas | 69.9% (102/146) | 44 |
| `src/features/varchas/book-details` | Varchas | 74.5% (105/141) | 36 |
| `src/features/varchas/payments` | Varchas | 88.7% (63/71) | 8 |
| `src/features/varchas` (index, session store, errors) | Varchas | 89.7% (35/39) | 4 |
| `src/features/vrinda/cart` | Vrinda | 85.0% (68/80) | 12 |
| `src/features/vrinda/orders` | Vrinda | 68.5% (148/216) | 68 |
| `src/features/vrinda/registration-profile` | Vrinda | 66.1% (37/56) | 19 |
| `src/features/vrinda/shared` | Vrinda | 92.9% (13/14) | 1 |
| `src/features/vrinda` (index) | Vrinda | 100.0% (10/10) | 0 |
| `src/features/contact` | Varchas | 87.5% (14/16) | 2 |
| `src/app.js` | Integration | 61.5% (8/13) | 5 |
| `src/config` | Integration | 60.0% (3/5) | 2 |
| `database/setup.js` | Uditi | 75.6% (34/45) | 11 |
| **Backend total** | | **81.5% (1,499/1,839)** | **340** |

### Backend files with the weakest branch coverage

Only files with at least 4 branches are listed.

| File | Branch coverage | Missed | What the untested branches are |
|---|---:|---:|---|
| `src/features/vrinda/orders/admin-orders.routes.js` | 33.3% (8/24) | 16 | Administrator order-update errors: invalid order ID, unknown status, order not found, invalid status transition (409), confirming an unpaid order, and Cash on Delivery collection errors |
| `src/features/varchas/authentication/email.service.js` | 55.0% (33/60) | 27 | Fallbacks for missing optional fields when formatting emails (name, currency, dates, payment method) and fields of the error log written when sending fails |
| `src/features/varchas/book-details/reviews.routes.js` | 61.0% (25/41) | 16 | Invalid book/review IDs, book not found, and deleting a review that does not exist |
| `src/app.js` | 61.5% (8/13) | 5 | The global error handler's unexpected-error (HTTP 500) path |
| `src/features/vrinda/orders/orders.service.js` | 62.2% (51/82) | 31 | Payment-status updates for failed, timed-out and cancelled payments; idempotent re-submission; empty-cart and out-of-stock guards when drafting an order |
| `src/features/vrinda/registration-profile/registration.validation.js` | 62.8% (27/43) | 16 | Non-text inputs (e.g. a number sent as the name) and profile-update errors for name, email and phone |
| `src/features/uditi/catalogue/presentation-store.js` | 69.4% (34/49) | 15 | Demo-mode configuration errors, database deadlock retry, and invalid external-provider book IDs |
| `src/features/vrinda/orders/order-confirmation.service.js` | 72.4% (21/29) | 8 | Email-address masking edge cases and "do not send" conditions (order unpaid, mail not configured, no recipient) |
| `src/features/varchas/authentication/auth.routes.js` | 73.9% (34/46) | 12 | Session regenerate/save/destroy errors and malformed password-reset requests |

The descriptions come from reading each file's uncovered lines in the lcov output (see §6).

## 4. Frontend branch coverage

| Module | Branch coverage | Missed |
|---|---:|---:|
| `src/features/uditi/catalogue` (`api.js`, `catalogueParams.js`) | 95.9% (117/122) | 5 |
| `src/features/uditi/checkout` (`api.js`, `deliveryRules.js`, `summaryChanges.js`) | 95.2% (80/84) | 4 |
| `src/features/uditi/inventory` (`inventoryRules.js`) | 94.4% (34/36) | 2 |
| `src/features/uditi/shared` (`api.js`, `format.js`) | 93.3% (42/45) | 3 |
| `src/layouts` (`backgrounds.js`) | 77.8% (7/9) | 2 |
| **Total (measured)** | **94.6% (280/296)** | **16** |

The 37 frontend files without automated tests (React pages and components, listed in
`CODE_COVERAGE_REPORT.md` §4) have no measured branch coverage.

## 5. Observations and recommendations

1. **Strongest:** inventory, shared transaction/query helpers and checkout (91–97%). These hold the
   stock and order-integrity rules (BR-1, DB-3), so it is good that they are the best tested.
2. **Weakest:** administrator order management (33%) and the order service (62%). These implement
   order status updates and payment results (SRS 5.6, 5.8, 5.9) and were the most recently changed.
   Recommended next tests:
   * an administrator trying an invalid status jump (e.g. `pending` → `delivered`), expecting 409;
   * an administrator confirming an order whose payment has not succeeded, expecting 409;
   * marking COD collection on an order that is not yet delivered;
   * failed and timed-out payment results, checking the order stays unpaid and reserved stock is released.
3. **Registration validation (63%):** add negative tests that send non-text values and invalid
   profile updates (name, email, phone) to cover each error message.
4. **Email service (55%):** add a test that formats an order email with optional fields missing, and
   one with a stub transport that throws, to cover the error-log path.
5. **Global error handler (`app.js`):** add one test where a route throws an unexpected error,
   checking the response is a generic 500 with no internal details.

## 6. How to reproduce

```bash
# Backend (needs MySQL; set credentials in backend/.env, then: npm run db:setup)
cd backend
node --env-file=.env --test --experimental-test-coverage \
  --test-coverage-exclude="test/**" --test-coverage-exclude="**/node_modules/**" \
  --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=lcov --test-reporter-destination=coverage.lcov

# Frontend
cd frontend
node --test --experimental-test-coverage \
  --test-coverage-exclude="**/*.test.js" --test-coverage-exclude="**/node_modules/**" \
  "src/**/*.test.js"
```

The `branch %` column of the printed coverage table and the `BRF`/`BRH` entries in
`coverage.lcov` give the figures used in this report.
