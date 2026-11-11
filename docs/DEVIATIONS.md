# Deviations from the Original Documents — Online Bookstore (Folio)

| | |
|---|---|
| Project | Online Bookstore — Team 16 |
| Compared against | SRS v1.0, SAD v1.1, STP v1.0 |
| Build | `main` |
| Tracking issue | #40 |

This document lists where the delivered system and process differ from the submitted SRS, SAD and
Test Plan, as required for the final demo. Each deviation is cross-referenced from
`docs/REQUIREMENTS_TRACEABILITY_MATRIX.md`.

## 1. Product deviations

### D1. Simulated payment instead of a payment gateway
| | |
|---|---|
| Original | SRS 5.5 and LEG-2: payments processed and verified through a PCI-DSS-compliant third-party payment gateway/API. SAD §3.4 lists a Payment Gateway/API as the external dependency. |
| Delivered | No payment provider is integrated. Online payment (card / UPI / net banking) is **simulated**: the customer confirms with a six-digit code emailed to their registered address. Verifying the code, re-checking stock and price, deducting inventory, creating the order and recording the payment all happen in one database transaction. **Cash on Delivery** was added as a second payment method. |
| Reason | The application is a college-project demonstration; it must not collect card details or perform real financial transactions (`backend/database/PAYMENTS.md`). |
| Impact | The bookstore's own payment rules are fully tested (no order on failure, no duplicate orders, single-use codes, stock unchanged on failure — TC-PAY-01 to TC-PAY-04). Integration with a real gateway is not demonstrated. LEG-2 is not met. |

### D2. External book catalogue (Open Library / Google Books)
| | |
|---|---|
| Original | SAD: the catalogue is served from the bookstore's own MySQL database; the only external dependency is the payment gateway. |
| Delivered | Catalogue browsing and search also query Open Library, with Google Books as a configured fallback. When the providers are unavailable, the store's own catalogue is shown with a notice. |
| Reason | Gives the catalogue current, real book records and covers (`docs/INTEGRATION_NOTES.md`). |
| Impact | New external dependency and failure mode. Concurrent searches during a provider outage are slow (DEF-06, open). Covered by TC-CAT-04. |

### D3. Features added beyond the SRS
| Feature | Where | Tests |
|---|---|---|
| Book reviews and ratings | `backend/src/features/varchas/book-details/reviews.routes.js` | `reviews.routes.test.js`, `reviews.mysql.integration.test.js` |
| Password reset by emailed one-time code | `backend/src/features/varchas/authentication/` | `password-reset.test.js`, `password-reset.mysql.integration.test.js` |
| Contact form | `backend/src/features/contact/` | `contact.routes.test.js` |
| Cash on Delivery collection and order returns | `backend/src/features/vrinda/orders/` | TC-ADM-04 |

None of these are in SRS v1.0. They do not change any existing requirement.

### D4. HTTPS/TLS not part of the application
| | |
|---|---|
| Original | SEC-4: HTTPS/TLS for login, customer data, checkout and payment. |
| Delivered | The Express server listens on plain HTTP. Session cookies are HttpOnly and SameSite=Strict, and are marked Secure in production mode, but TLS itself is not configured in the repository. |
| Reason | TLS is expected to be provided by a reverse proxy at deployment (defect DEF-09). No deployment was set up. |
| Impact | SEC-4 is not met in the delivered build. |

### D5. Reliability requirements not implemented
| | |
|---|---|
| Original | REL-1 (99% uptime), REL-3 (automated backups), REL-4 (recovery); SCAL-2 (horizontal scaling). |
| Delivered | No deployment, monitoring or backup mechanism exists. The application keeps sessions in MySQL, so it can run behind more than one server, but this was not tested. |
| Impact | TC-REL-01, TC-REL-03, TC-REL-04, TC-SCAL-02 and TC-SCAL-03 were not run. |

### D6. Order statuses extended
| | |
|---|---|
| Original | SRS 5.9: Pending, Confirmed, Processing, Shipped, Delivered, Cancelled. |
| Delivered | Adds Packed, Out for Delivery, Return Requested and Returned, plus a separate payment status (e.g. pending collection for COD). |
| Impact | More detailed tracking. The BR-2 cancellation rule still applies (no cancellation once Shipped). |

## 2. Design document deviations

| Item | Original (SAD) | Delivered |
|---|---|---|
| REST API | §4.3 lists endpoints as "to be finalised" | Final endpoints are defined in each feature's `*.routes.js` file |
| Backend structure | Layered controllers / services / repositories folders | Each feature folder contains its own routes, service, repository and validation files. The shared `controllers/`, `services/`, `repositories/` folders hold only READMEs |
| Payment component and sequence diagram | Gateway request/response | Email OTP and COD flows (see D1) |

## 3. Test plan deviations

| Item | Original (STP v1.0) | Actual |
|---|---|---|
| Schedule | 17 Sep – 2 Oct 2026 | Testing done during Sprint 2 (26–30 Oct) and Part-3 (2–6 Nov); reports produced 11 Nov 2026 |
| Tools | Postman, Selenium, JMeter (proposed) | Node.js built-in test runner for unit, integration and system tests; load measured with a scripted client; no Selenium UI automation |
| Test cases | 38 planned | 38 planned plus TC-CAT-04, TC-CAT-05, TC-CART-04, TC-PAY-04, TC-ADM-04, TC-ADM-05, BR-3 (STP v1.1) |
| Browsers | Chrome, Firefox, Safari, Edge | Cross-browser testing tracked in #44 |

## 4. Process deviations

| Item | Requirement | What happened |
|---|---|---|
| Sprint 1 scope | Sprint 1: 19–23 Oct | Cart, registration/profile and order stories (#4, #6, #9, #12) were merged on 24–25 Oct, after Sprint 1 ended |
| Development freeze | Freeze at end of Sprint 2 (30 Oct) | PR #33 (order lifecycle, payment OTP, contact form) was merged on 11 Nov, after the freeze. That work is now tracked under Sprint 3 |
| Sprint 1 video | About 1 minute | Original upload was 4 min 48 s, uploaded 6 Nov (re-edit tracked in #43) |
| Sprint 2 video | About 2 minutes | Original upload was 1 min 37 s (re-record tracked in #50) |
| GitHub Actions | Enabled for PRs and commits | Not set up during Sprints 1–2 (tracked in #47) |
