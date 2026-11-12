# Requirements Traceability Matrix — Online Bookstore (Folio)

| | |
|---|---|
| Project | Online Bookstore — Team 16 |
| Requirements source | SRS v1.0 (sections 5–7) |
| Test source | STP v1.1 test cases; results from `docs/SYSTEM_VALIDATION_REPORT.md` (11 Nov 2026) |
| Build | `main` |
| Tracking issue | #39 |

The SRS has no individual FR IDs, so functional requirements are traced by SRS section number
(as agreed in STP §3). Paths are relative to `backend/` (BE) or `frontend/src/` (FE).

**Status legend:** **Verified** = test executed and passed. **Partial** = only part of the requirement
is verified. **Not run** = test exists in the plan but was not executed. **Not met** = requirement is
not implemented as written (see `docs/DEVIATIONS.md`). **Inspection** = verified by review, no test case.

## 1. Functional requirements (SRS §5)

| Requirement | Implementation | Test cases | Status |
|---|---|---|---|
| 5.1 Customer Account Management | BE `src/features/vrinda/registration-profile/`, `src/features/varchas/authentication/`; FE `features/vrinda/registration-profile/`, `features/varchas/authentication/` | TC-AUTH-01, TC-AUTH-02, TC-AUTH-03 | Verified |
| 5.2 Book Catalogue and Search | BE `src/features/uditi/catalogue/`, `src/features/varchas/book-details/`; FE `features/uditi/catalogue/`, `features/varchas/book-details/` | TC-CAT-01 to TC-CAT-05 | Verified |
| 5.3 Shopping Cart | BE `src/features/vrinda/cart/`; FE `features/vrinda/cart/` | TC-CART-01 to TC-CART-04 | Verified |
| 5.4 Checkout and Delivery | BE `src/features/uditi/checkout/`; FE `features/uditi/checkout/` | TC-CHK-01, TC-CHK-02, TC-CHK-03 | Verified |
| 5.5 Payment Processing | BE `src/features/varchas/payments/`; FE `features/varchas/payments/` | TC-PAY-01 to TC-PAY-04 | Verified (simulated OTP payment, not a gateway — see Deviations D1) |
| 5.6 Order Management | BE `src/features/vrinda/orders/orders.*`; FE `features/vrinda/orders/` | TC-ORD-01, TC-ORD-02, TC-ORD-03 | Verified |
| 5.7 Inventory Management | BE `src/features/uditi/inventory/`; FE `features/uditi/inventory/` | TC-INV-01, TC-INV-02, TC-INV-03 | Verified |
| 5.8 Administrator Management | BE `src/features/varchas/book-details/`, `src/features/uditi/inventory/`, `src/features/vrinda/orders/admin-orders.routes.js`; FE `features/varchas/admin-catalogue/` | TC-ADM-01 to TC-ADM-05 | Verified |
| 5.9 Order Tracking and Status | BE `src/features/vrinda/orders/`, `order_status_history` table | TC-ORD-03, TC-ADM-04 | Verified |
| 5.10 Security and Access Control | See SEC-1 to SEC-8 below | — | Partial (SEC-4) |

## 2. Security requirements

| Requirement | Implementation | Test cases | Status |
|---|---|---|---|
| SEC-1 Secure Authentication | `authentication/auth.middleware.js`, `auth.routes.js` (login rate limit) | TC-AUTH-03, TC-ADM-01 | Verified |
| SEC-2 Password Protection | `authentication/password.js` (bcrypt) | TC-AUTH-01 | Verified |
| SEC-3 Authorization and Access Control | `auth.middleware.js` (`requireAdmin`), `AdminOnly.jsx` | TC-ADM-01 | Verified |
| SEC-4 Secure Communication | Not in application; left to deployment | — | Not met (Deviations D4) |
| SEC-5 Data and Transaction Integrity | `uditi/shared/transaction.js`, validation modules in each feature | TC-PAY-03, TC-INV-03, TC-CHK-03 | Verified |
| SEC-6 Session Security | `varchas/mysql-session-store.js`, logout in `auth.routes.js` | System test "SEC-5 logout invalidates the session", `mysql-session.integration.test.js` | Verified |
| SEC-7 Payment Data Protection | `payments/` — no card data stored; hashed single-use OTP | TC-PAY-03 | Verified |
| SEC-8 Administrative Activity Protection | `requireAdmin` on admin routes; `inventory_adjustments` audit table | TC-ADM-01 to TC-ADM-03 | Verified |

## 3. Non-functional requirements (SRS §6)

| Requirement | Implementation / evidence | Test cases | Status |
|---|---|---|---|
| PERF-1 Search within 2 s | Indexed store search; catalogue fallback | TC-PERF-01 | Verified for store search; DEF-06 open during provider outage |
| PERF-2 Checkout within 3 s | Single-transaction order creation | TC-PERF-02 | Verified |
| PERF-3 500 concurrent users | — | TC-PERF-03 | Partial (500 concurrent detail requests passed; search limited by per-IP rate limiter from one client) |
| PERF-4 Page load within 3 s | — | TC-PERF-04 | Partial (API level only) |
| SCAL-1 100,000 titles | Indexed `books` table | TC-SCAL-01 | Verified |
| SCAL-2 Horizontal app scaling | Sessions in MySQL (stateless app servers) | TC-SCAL-02 | Not run |
| SCAL-3 Database growth | — | TC-SCAL-03 | Not run |
| REL-1 99% uptime | — | TC-REL-01 | Not run |
| REL-2 Rollback on third-party failure | Transactions in `uditi/shared/transaction.js` | TC-REL-02 (via TC-PAY-02, TC-INV-02) | Verified |
| REL-3 Automated backups | No backup mechanism | TC-REL-03 | Not run (not implemented) |
| REL-4 Recovery | Depends on REL-3 | TC-REL-04 | Not run (not implemented) |
| USE-1 Book details within 3 clicks | Home → catalogue → book | TC-UX-01 | Verified (2 clicks; `USABILITY_COMPATIBILITY_CHECK.md`) |
| USE-2 Clear error messages | Field-level validation messages in every feature | TC-UX-02 | Verified (API level) |
| USE-3 Consistent layout | Shared components in FE `components/shared/`, `styles/tokens.css` | — | Inspection only (no test case) |
| USE-4 Admin learnability | Labelled admin catalogue / inventory pages | — | Inspection only (no test case) |
| MAIN-1 Modularity | Separate feature folders for catalogue, cart, checkout, payment, orders, admin | — | Inspection |
| MAIN-2 Logging | Error logging in `src/app.js`; `inventory_adjustments` and `order_status_history` tables | — | Partial (admin catalogue edits are not audited) |
| MAIN-3 Code documentation | README in each backend feature folder; `docs/` | — | Inspection |
| PORT-1 Browser compatibility | Standard React/Vite build, no browser-specific code | TC-COMP-01 | Partial (Chrome, Edge, Firefox pass; Safari not available) |
| PORT-2 Device compatibility | Responsive CSS modules | TC-COMP-01 | Verified (desktop, tablet, mobile) |

## 4. Other requirements (SRS §7)

| Requirement | Implementation / evidence | Test cases | Status |
|---|---|---|---|
| LEG-1 Data protection | Hashed passwords; no card data; masked emails in logs | TC-AUTH-01, TC-PAY-03 | Verified |
| LEG-2 PCI-DSS payment gateway | No gateway used | — | Not met (Deviations D1) |
| LEG-3 Terms of use at registration | `acceptedTerms` check in registration | TC-AUTH-01 (negative) | Verified |
| DB-1 Data retention | Removed books are deactivated, not deleted; orders keep their items | TC-ADM-02 | Verified |
| DB-2 Referential integrity | 21 foreign-key constraints in `database/schema.sql` | `test/uditi/schema.test.js` | Verified |
| DB-3 Inventory consistency under concurrency | Guarded `UPDATE … WHERE quantity >= ?` inside transactions | TC-INV-03 | Verified |
| BR-1 Stock enforcement | `uditi/inventory/stock.js` | TC-INV-02, TC-CART-04 | Verified |
| BR-2 Cancel only before Shipped | `vrinda/orders/orders.service.js` | TC-ORD-03 | Verified |
| BR-3 Pricing authority | Admin-only price updates; order items store the price paid | TC-ADM-02, system test "BR-3" | Verified |

## 5. Coverage summary

| Group | Requirements | Verified | Partial | Not run / not met | Inspection |
|---|---:|---:|---:|---:|---:|
| Functional (5.1–5.10) | 10 | 9 | 1 | 0 | 0 |
| Security (SEC) | 8 | 7 | 0 | 1 | 0 |
| Non-functional (§6) | 20 | 7 | 4 | 5 | 4 |
| Other (§7) | 9 | 8 | 0 | 1 | 0 |
| **Total** | **47** | **31** | **5** | **7** | **4** |

Every SRS requirement is traced to an implementation or marked as not implemented. Requirements
with no automated test (USE-3, USE-4, MAIN-1, MAIN-3) are verified by inspection only.
