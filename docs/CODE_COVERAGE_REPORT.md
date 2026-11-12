# Code Coverage Report — Online Bookstore (Folio)

| | |
|---|---|
| Project | Online Bookstore — Team 16 |
| Deliverable | SE Mini-Project Deliverables Part-3, item 2.b.iii (Code Coverage Report) |
| Tracking issue | #36 |
| Build under test | `main` at commit `f3c1198` (11 Nov 2026) |
| Tool | Node.js 22 built-in coverage (`node --test --experimental-test-coverage`) |
| Executed on | 11 November 2026 |
| Prepared by | Vrinda Venugopal M (PES2UG24CS601) |

Branch (decision) coverage is reported separately in [`BRANCH_COVERAGE_REPORT.md`](BRANCH_COVERAGE_REPORT.md).

## 1. What was measured

* **Line coverage**: the share of executable source lines that ran at least once during the tests.
* **Function coverage**: the share of functions that were called at least once.
* Coverage was collected from the **complete** test runs: backend unit, integration and STP system
  tests against MySQL (322 tests at the time of measurement; the suite has since grown to 325), and frontend tests (85 tests).
* Test files themselves are excluded from the numbers.
* **Important limitation:** Node's coverage only measures source files that the tests load. A file
  that no test imports does not appear in the totals at all. Those files are listed separately in
  §4, so the headline numbers are not read as "whole codebase".

## 2. Summary

| Area | Files measured | Lines covered | Line coverage | Functions covered | Function coverage |
|---|---:|---:|---:|---:|---:|
| Backend (`backend/src`, `backend/database`) | 59 of 61 | 4,192 / 4,404 | **95.2%** | 470 / 518 | **90.7%** |
| Frontend logic modules (`frontend/src`, `.js`) | 9 of 46 | 545 / 549 | **99.3%** | 69 / 76 | **90.8%** |

**Backend:** coverage is high. Every API feature module is exercised by the tests.

**Frontend:** the 9 logic modules that have tests (validation, URL parameters, API clients) are almost
fully covered, but **37 of the 46 frontend source files have no automated tests**. These are the
React pages and components (`*.jsx`) and three API client files, about 2,190 non-blank lines in
total. If those lines are counted as uncovered, frontend line coverage is roughly **20%**. The
pages and components are currently verified only by manual walkthrough.

## 3. Backend coverage by module

| Module | Folder owner | Files | Line coverage | Function coverage |
|---|---|---:|---:|---:|
| `src/features/uditi/catalogue` | Uditi | 5 | 97.2% (960/988) | 83.3% (105/126) |
| `src/features/uditi/checkout` | Uditi | 5 | 100.0% (292/292) | 100.0% (31/31) |
| `src/features/uditi/inventory` | Uditi | 5 | 99.0% (498/503) | 98.0% (50/51) |
| `src/features/uditi/shared` | Uditi | 5 | 98.7% (151/153) | 100.0% (22/22) |
| `src/features/uditi` (index) | Uditi | 1 | 100.0% (57/57) | 100.0% (3/3) |
| `src/features/varchas/authentication` | Varchas | 6 | 98.0% (297/303) | 95.7% (45/47) |
| `src/features/varchas/book-details` | Varchas | 5 | 94.6% (331/350) | 97.3% (36/37) |
| `src/features/varchas/payments` | Varchas | 4 | 91.7% (189/206) | 78.9% (15/19) |
| `src/features/varchas` (index, session store, errors) | Varchas | 3 | 98.5% (134/136) | 82.6% (19/23) |
| `src/features/vrinda/cart` | Vrinda | 4 | 99.1% (227/229) | 100.0% (27/27) |
| `src/features/vrinda/orders` | Vrinda | 7 | 88.2% (650/737) | 89.8% (79/88) |
| `src/features/vrinda/registration-profile` | Vrinda | 3 | 85.4% (117/137) | 80.0% (12/15) |
| `src/features/vrinda/shared` | Vrinda | 1 | 93.1% (27/29) | 100.0% (7/7) |
| `src/features/vrinda` (index) | Vrinda | 1 | 100.0% (38/38) | 100.0% (3/3) |
| `src/features/contact` | Varchas | 1 | 100.0% (24/24) | 100.0% (3/3) |
| `src/app.js` | Integration | 1 | 100.0% (41/41) | 75.0% (3/4) |
| `src/config` | Integration | 1 | 100.0% (30/30) | 100.0% (2/2) |
| `database/setup.js` | Uditi | 1 | 85.4% (129/151) | 80.0% (8/10) |
| **Backend total** | | **59** | **95.2% (4,192/4,404)** | **90.7% (470/518)** |

### Backend files with the lowest line coverage

| File | Line coverage |
|---|---:|
| `src/features/vrinda/registration-profile/registration-profile.repository.js` | 70.0% (21/30) |
| `src/features/vrinda/registration-profile/registration-profile.routes.js` | 75.6% (34/45) |
| `src/features/vrinda/orders/order-confirmation.service.js` | 79.5% (62/78) |
| `src/features/varchas/payments/payments.routes.js` | 81.1% (30/37) |
| `src/features/vrinda/orders/admin-orders.routes.js` | 81.2% (56/69) |
| `src/features/vrinda/orders/mysql-order-confirmation.repository.js` | 81.8% (27/33) |
| `src/features/vrinda/orders/orders.service.js` | 83.5% (218/261) |
| `src/features/varchas/book-details/mysql-books.repository.js` | 84.0% (63/75) |

Backend files not loaded by any test: `src/server.js` (process start-up only; the tests boot the same
app through `src/app.js`) and `database/seed-demo-reviews.js` (demo data script).

## 4. Frontend coverage

### Measured modules

| Module | Files | Line coverage | Function coverage |
|---|---:|---:|---:|
| `src/features/uditi/catalogue` (`api.js`, `catalogueParams.js`) | 2 | 100.0% (198/198) | 92.9% (26/28) |
| `src/features/uditi/checkout` (`api.js`, `deliveryRules.js`, `summaryChanges.js`) | 3 | 100.0% (169/169) | 91.7% (22/24) |
| `src/features/uditi/inventory` (`inventoryRules.js`) | 1 | 100.0% (50/50) | 100.0% (5/5) |
| `src/features/uditi/shared` (`api.js`, `format.js`) | 2 | 96.0% (96/100) | 83.3% (10/12) |
| `src/layouts` (`backgrounds.js`) | 1 | 100.0% (32/32) | 85.7% (6/7) |
| **Total (measured)** | **9** | **99.3% (545/549)** | **90.8% (69/76)** |

The frontend tests also exercise nine shared backend validation and inventory modules; those are
counted in the backend figures, not here.

### Files with no automated tests (37)

* **App shell and layout:** `app/App.jsx`, `app/router.jsx`, `main.jsx`, `layouts/MainLayout.jsx`, `layouts/BackgroundLayer.jsx`
* **Shared components:** `BookCard`, `Button`, `Container`, `FeaturePlaceholder`, `Footer`, `Navbar`, `Section`
* **Pages:** `HomePage.jsx`, `AboutPage.jsx`, `NotFoundPage.jsx`
* **Catalogue (Uditi):** `index.jsx`, `BookResult.jsx`, `CategoriesPage.jsx`, `FilterPanel.jsx`, `Pagination.jsx`
* **Checkout (Uditi):** `index.jsx`, `DeliveryForm.jsx`, `OrderSummary.jsx`
* **Inventory admin (Uditi):** `index.jsx`, `StockRow.jsx`, `api.js`
* **Varchas:** `authentication/index.jsx`, `AdminOnly.jsx`, `PasswordResetPage.jsx`, `admin-catalogue/index.jsx`, `book-details/index.jsx`, `payments/index.jsx`, `api.js`
* **Vrinda:** `cart/index.jsx`, `orders/index.jsx`, `registration-profile/index.jsx`, `api.js`

## 5. Observations and recommendations

1. **Backend line coverage (95.2%) is high.** The STP system suite drives the real routes, services
   and repositories end to end, so most backend code runs during testing.
2. **The weakest backend area is orders and registration/profile** (85–88% lines). The uncovered
   lines are mainly error paths and administrator order operations added most recently.
3. **The React UI is the main gap.** Adding component tests (for example React Testing Library
   with a test runner that supports JSX) for the cart, checkout and order pages would raise
   frontend coverage the most.
4. **Function coverage is lower than line coverage** in two places. In the catalogue module
   (83.3%), 18 of the 21 uncalled functions are in `open-library.js` and only run when the external
   book providers respond, and they were offline during testing. In payments (78.9%), the uncalled
   functions are OTP invalidation (`invalidate`), order-confirmation retry
   (`retryOrderConfirmation`) and two route handlers in `payments.routes.js`; these need dedicated
   tests.

## 6. How to reproduce

```bash
# Backend (needs MySQL; set credentials in backend/.env, then: npm run db:setup)
cd backend
node --env-file=.env --test --experimental-test-coverage \
  --test-coverage-exclude="test/**" --test-coverage-exclude="**/node_modules/**"

# Frontend
cd frontend
node --test --experimental-test-coverage \
  --test-coverage-exclude="**/*.test.js" --test-coverage-exclude="**/node_modules/**" \
  "src/**/*.test.js"
```

Add `--test-reporter=lcov --test-reporter-destination=coverage.lcov` to save the raw data for an
HTML viewer.
