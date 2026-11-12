# Software Test Plan (STP)

Online Bookstore — Version 1.1

| Item | Details |
|---|---|
| Project | Online Bookstore |
| Authors | Varchas – PES2UG24CS575, Uditi Mourya – PES2UG24CS565, Vrinda Venugopal M – PES2UG24CS601 |
| Date | 11-11-2026 |
| Status | Revised (v1.1) |
| Reference Documents | Online Bookstore SRS v1.0 with Revision 1.1 addendum, Online Bookstore SAD v1.2 (11-11-2026), Deviations document (docs/DEVIATIONS.md) |

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 16-09-2026 | Team 16 | Initial test plan. |
| 1.1 | 11-11-2026 | Vrinda Venugopal M | Updated to match the implemented system and the tests actually executed in the sprints: payment test cases revised for the simulated OTP and Cash on Delivery flow; seven test cases added (TC-CAT-04, TC-CAT-05, TC-CART-04, TC-PAY-04, TC-ADM-04, TC-ADM-05, TC-BR-03); test environment, tools and schedule updated to what was used; risks and assumptions updated. |

## 1. Introduction

This Software Test Plan (STP) defines the testing objectives, scope, strategy, resources, schedule, responsibilities, risks, traceability, and reporting approach for the Online Bookstore. It is derived from the team's SRS and SAD and, in version 1.1, from the implemented system.

**Scope:** Testing covers customer account management, catalogue/search, shopping cart, checkout and delivery information, payment processing, order management and tracking, inventory management, administrator operations, security controls, and specified non-functional requirements. Physical warehouse operations, book publishing, physical delivery operations, banking infrastructure, and internal implementation of third-party services are outside scope.

**References:** Online Bookstore SRS v1.0; Online Bookstore SAD v1.1; Online Bookstore Project Proposal; PES University Software Engineering course materials; IEEE Std 830-1998.

**Definitions:** SRS (Software Requirements Specification), SAD (Software Architecture and Design Specification), STP (Software Test Plan), RTM (Requirements Traceability Matrix), TC (Test Case), RBAC (Role-Based Access Control), API (Application Programming Interface), DBMS (Database Management System), NFR (Non-Functional Requirement), OTP (One-Time Password), COD (Cash on Delivery).

## 2. Test Items

- Customer registration, login, authentication, authorization, and profile management.
- Book catalogue browsing, search, filtering, sorting, and book-detail display, including the external catalogue providers (Open Library / Google Books) and the store-catalogue fallback.
- Shopping cart add, quantity update, and remove operations.
- Checkout, delivery information, and order summary.
- Payment processing: simulated online payment confirmed by an emailed one-time code, and Cash on Delivery. No external payment gateway is integrated (see Deviations D1).
- Order creation, unique Order ID generation, order viewing, tracking, and eligible cancellation.
- Inventory quantity management and stock enforcement during checkout.
- Administrator book, pricing, category, inventory, and order management.
- Security controls: password protection, RBAC, HTTPS/TLS, session security, transaction integrity, and payment-data protection.
- Performance, scalability, reliability, usability, maintainability, and portability.

## 3. Features to be Tested

The SRS does not define individual FR identifiers. Therefore, this test plan uses SRS section numbers and the explicit NFR/security identifiers for traceability, consistent with the SAD.

| Requirement / Feature | Planned validation |
|---|---|
| SRS 5.1 – Customer Account Management | Registration, login, authentication, authorization, profile management |
| SRS 5.2 – Book Catalogue and Search | Browse, title/author/category/ISBN search, filtering, sorting, details; provider-outage fallback |
| SRS 5.3 – Shopping Cart | Add, quantity update, remove items; stock limits |
| SRS 5.4 – Checkout and Delivery | Cart review, delivery details, order summary |
| SRS 5.5 – Payment Processing | OTP request and verification, failure and expiry handling, duplicate prevention, resend and attempt limits, Cash on Delivery |
| SRS 5.6 – Order Management | Order ID, history, tracking, eligible cancellation |
| SRS 5.7 / BR-1 – Inventory Management | Stock updates and insufficient-stock prevention |
| SRS 5.8 / SEC-8 – Administrator Management | Authorized CRUD, inventory and order management |
| SRS 5.9 / BR-2 – Order Tracking and Status | Status display and permitted status handling |
| SRS 5.10 / SEC-1 to SEC-8 – Security | Authentication, hashing, RBAC, TLS, sessions, transaction/payment protection |
| PERF-1 to PERF-4 | Response time, checkout, 500 concurrent users, page load |
| SCAL-1 to SCAL-3 | 100,000-title catalogue and application/database scaling |
| REL-1 to REL-4 | 99% uptime, failure handling, backups, recovery |
| USE-1 to USE-4 | Navigation, messages, consistency, administrator learnability |
| MAIN-1 to MAIN-3 | Modularity, logging, documentation |
| PORT-1 to PORT-2 | Browser and desktop/tablet/mobile compatibility |

## 4. Features Not to be Tested

- Physical warehouse operations.
- Book publishing activities.
- Physical delivery/courier operations and internal courier implementation.
- Banking infrastructure and internal banking-system implementation.
- Integration with a real payment gateway, because none is integrated in the delivered build (Deviations D1).
- Internal implementation of Open Library and Google Books; only the bookstore's integration and fallback handling are tested.
- Third-party infrastructure not controlled by the project team.

## 5. Test Approach / Strategy

### 5.1 Test Levels

- **Unit Testing** – Individual modules such as authentication, catalogue/search, cart, checkout, inventory, payment and order logic.
- **Integration Testing** – Interactions among the Express REST API, MySQL and the external catalogue providers.
- **System Testing** – Complete end-to-end customer and administrator workflows, automated against the real application and a real MySQL database.
- **Acceptance Testing (UAT)** – Verification against SRS requirements and usability expectations.

### 5.2 Test Types

- Functional testing – Core customer, administrator, payment, order, and inventory behaviour.
- Negative and boundary testing – Invalid credentials/input, empty cart, excessive quantity, unavailable stock, incorrect or expired payment codes, and unauthorized access.
- Regression testing – Re-run the full automated suite after defect fixes or changes.
- Performance testing – Response time, checkout processing, and concurrent-request behaviour.
- Security validation – Authentication, RBAC, password protection, TLS, session security, transaction integrity, and payment-data handling.
- Usability and compatibility testing – Navigation, messages, consistency, learnability, browsers, and responsive layouts.
- Recovery testing – Third-party failure, backup restoration, and transaction consistency.

### 5.3 Entry Criteria

- Stable testable build is available.
- Required database schema and representative test data are available.
- Test environment and required APIs are accessible.
- Major blocking defects are resolved or formally accepted.
- Test cases and expected results are reviewed.

### 5.4 Exit Criteria

- 100% of planned test cases have been executed for the release scope.
- No unresolved Critical defects remain.
- All planned SRS requirements have corresponding test coverage.
- Required NFR/security tests have been executed and recorded.
- UAT acceptance criteria are satisfied or formally waived.

### 5.5 Security Validation

- Verify authentication before protected functions and administrator operations.
- Verify passwords are not stored in plain text and use secure hashing.
- Verify RBAC prevents customers from accessing administrator operations.
- Verify HTTPS/TLS for sensitive client/server communication.
- Verify authenticated sessions are invalidated on logout.
- Verify input validation and transaction consistency prevent duplicate/inconsistent orders.
- Verify payment codes are stored only as hashes, are single-use, expire, and are rate limited; verify no card data is collected.
- Verify significant errors and administrative actions are logged without exposing sensitive customer data.

## 6. Test Environment

| Area | Environment / Configuration |
|---|---|
| Client hardware | Desktop/laptop plus representative tablet and smartphone screen sizes |
| Client software | Latest stable Chrome, Firefox, Safari, and Edge |
| Frontend | React.js web interface (Vite build) |
| Backend | Node.js 22 + Express.js REST API |
| Database | MySQL 8.0; each automated test run creates and drops its own database |
| External services | Open Library / Google Books (switched off in system tests to exercise the fallback); email OTP delivery replaced by a captured test mail sink |
| Network | Stable internet connection; HTTPS/TLS expected at deployment (see Deviations D4) |
| Unit / integration / system tests | Node.js built-in test runner (`node --test`) |
| Coverage | Node.js built-in coverage (`--experimental-test-coverage`) |
| Performance | Scripted concurrent client against the real app with a 100,000-book database |
| UI / compatibility | Manual walkthrough on Chrome, Edge and Firefox at desktop and mobile widths |
| Defect tracking | GitHub Issues |
| Test data | Generated customer/admin accounts, books, categories, inventory, carts, orders, and payment challenges |

## 7. Test Schedule

| Milestone | Planned (v1.0) | Actual (v1.1) |
|---|---|---|
| Test plan and test-case design | 17-Sep-2026 | 16-Sep-2026 (v1.0); 11-Nov-2026 (v1.1) |
| Unit and integration testing | 19-Sep to 21-Sep-2026 | Sprint 1 and 2 (19-Oct to 30-Oct-2026), alongside development |
| System and functional testing | 22-Sep to 25-Sep-2026 | Sprint 2 (26-Oct to 30-Oct-2026) |
| Security / performance / compatibility testing | 26-Sep to 27-Sep-2026 | Part-3 testing and Sprint 3 (2-Nov to 11-Nov-2026) |
| Defect retesting and regression | 28-Sep to 29-Sep-2026 | Full suite re-run on every merge |
| Final test summary and sign-off | 02-Oct-2026 | 11-Nov-2026 (test reports in docs/) |

## 8. Test Deliverables

- Software Test Plan (STP) v1.1.
- Automated test scripts (`backend/test/`, `frontend/src/**/*.test.js`).
- Unit Test Report, System Validation Report, Code Coverage Report and Branch Coverage Report (`docs/`).
- Defect reports and retest evidence.
- Requirements Traceability Matrix (`docs/REQUIREMENTS_TRACEABILITY_MATRIX.md`).

## 9. Roles and Responsibilities

| Role | Name | Responsibility |
|---|---|---|
| QA Lead | Varchas | Prepare/maintain STP, coordinate execution, review coverage and results. |
| Test Engineer | Uditi Mourya | Design/execute tests, perform regression, record defects. |
| Developer / Test Support | Vrinda Venugopal M | Support builds, defect diagnosis/fixes, and technical testing. |
| Product Owner / Evaluator | Vrinda Venugopal M | Review acceptance criteria, test results, and provide sign-off. |

## 10. Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Delay in stable build delivery | Request early smoke builds and prepare test cases before full build availability. |
| Test environment/database downtime | Each test run creates its own throw-away database. |
| External catalogue providers unavailable | Store-catalogue fallback; providers switched off in system tests (TC-CAT-04). |
| Email delivery unavailable for payment codes | Captured test mail sink in automated tests. |
| Duplicate order/payment requests | Test transaction consistency and verify failed requests do not create duplicates. |
| Insufficient stock under concurrent checkout | Execute concurrent purchase tests and verify stock/order consistency. |
| Unauthorized administrative access | Perform RBAC and authorization tests for customer and administrator roles. |
| Cross-browser/responsive defects | Test specified browsers and desktop/tablet/mobile layouts. |

## 11. Assumptions & Dependencies

- React.js frontend, Node.js/Express.js backend, and MySQL database are available for testing.
- Representative test data and test accounts can be created without using real customer/payment credentials.
- Payment is simulated in the application, so no payment-gateway sandbox is required.
- External delivery tracking is treated as an external dependency; only specified internal handling is tested.
- HTTPS/TLS is provided at deployment; it is not part of the local test environment.
- Testing is performed on supported modern browsers and representative device sizes.

## 12. Suspension & Resumption Criteria

**Suspend testing if:**

- Test environment or a critical dependency is unavailable for more than 4 hours.
- The build is sufficiently unstable that more than 30% of planned tests are blocked.
- A Critical defect prevents meaningful execution of major purchase, authentication, or administrator flows.
- Database/test data becomes unreliable or corrupted.

**Resume testing when:**

- Blocking/Critical defects are resolved or formally accepted.
- Environment and dependencies are stable.
- Required test data is restored or recreated.
- A smoke test confirms that the build is suitable for continued execution.

## 13. Test Case Management & Traceability

The RTM (`docs/REQUIREMENTS_TRACEABILITY_MATRIX.md`) maps each SRS requirement or requirement group to one or more test cases. Since the SRS does not define individual FR identifiers, traceability uses SRS section numbers and explicit NFR/security identifiers.

| Traceability Item | Test Cases |
|---|---|
| SRS 5.1 – Customer Account Management | TC-AUTH-01 valid registration; TC-AUTH-02 invalid login; TC-AUTH-03 protected-page authorization |
| SRS 5.2 – Catalogue/Search | TC-CAT-01 title search; TC-CAT-02 author/category/ISBN search; TC-CAT-03 filtering/sorting; **TC-CAT-04** provider outage fallback; **TC-CAT-05** book details and unknown book |
| SRS 5.3 – Shopping Cart | TC-CART-01 add item; TC-CART-02 quantity update; TC-CART-03 remove item; **TC-CART-04** invalid and over-stock quantities |
| SRS 5.4 – Checkout | TC-CHK-01 delivery details; TC-CHK-02 order summary; TC-CHK-03 invalid checkout input |
| SRS 5.5 / SEC-7 – Payment | TC-PAY-01 verified payment code creates the order; TC-PAY-02 incorrect/expired code creates no order; TC-PAY-03 duplicate submission; **TC-PAY-04** resend cooldown and attempt limits |
| SRS 5.6 / BR-2, BR-3 – Orders | TC-ORD-01 order creation/ID; TC-ORD-02 history; TC-ORD-03 tracking/cancellation; **TC-BR-03** price change does not alter existing orders |
| SRS 5.7 / BR-1 – Inventory | TC-INV-01 stock decrement; TC-INV-02 insufficient stock; TC-INV-03 concurrent consistency |
| SRS 5.8 / SEC-8 – Administrator | TC-ADM-01 admin login; TC-ADM-02 book CRUD; TC-ADM-03 inventory/order update; **TC-ADM-04** fulfilment status and COD collection; **TC-ADM-05** list customer orders |
| PERF-1 to PERF-4 | TC-PERF-01 catalogue response; TC-PERF-02 checkout; TC-PERF-03 500-user load; TC-PERF-04 page load |
| SCAL-1 to SCAL-3 | TC-SCAL-01 100,000-title catalogue; TC-SCAL-02 horizontal app scaling; TC-SCAL-03 database growth |
| REL-1 to REL-4 | TC-REL-01 uptime; TC-REL-02 payment failure rollback; TC-REL-03 backup; TC-REL-04 recovery |
| USE-1 to USE-4 / PORT-1 to PORT-2 | TC-UX-01 three-click navigation; TC-UX-02 error messages; TC-COMP-01 browser/device compatibility |

### 13.1 Test cases added in v1.1

| ID | Requirement | Description | Expected result |
|---|---|---|---|
| TC-CAT-04 | SRS 5.2, REL-2 | Browse the catalogue while the external book providers are unreachable. | Store catalogue is shown with a notice; no error page. |
| TC-CAT-05 | SRS 5.2 | Open book details for a valid, an unknown and a removed book. | Details shown publicly; unknown or removed book returns 404. |
| TC-CART-04 | SRS 5.3, BR-1 | Add or update with invalid quantities, unknown books, out-of-stock books and more than the stock. | Request refused with a message stating the available quantity. |
| TC-PAY-04 | SRS 5.5, SEC-5 | Request a second payment code immediately; enter wrong codes repeatedly. | Immediate resend refused (429); after five wrong codes the challenge is locked; no order created. |
| TC-ADM-04 | SRS 5.8, 5.9 | Administrator moves an order through fulfilment statuses and records COD collection. | Status and payment changes persist and appear in customer tracking. |
| TC-ADM-05 | SRS 5.8 | Administrator lists customer orders. | All customer orders are returned to administrators only. |
| TC-BR-03 | BR-3 | Change a book's price after it has been ordered. | Existing order keeps the original price. |

## 14. Test Metrics & Reporting

**Metrics collected:** percentage of planned test cases executed; pass/fail/blocked/not-run percentages; requirement coverage percentage; defect count by severity; regression pass rate; code and branch coverage; performance measurements against PERF-1 to PERF-4; availability/recovery results against REL-1 to REL-4.

**Reports:** Unit Test Report, System Validation Report, Code Coverage Report, Branch Coverage Report, Requirements Traceability Matrix and Deviations document, all in `docs/`.

## 15. Approvals

| Role | Name | Date |
|---|---|---|
| QA Lead | Varchas | |
| Test Engineer | Uditi Mourya | |
| Developer / Test Support / Product Owner / Evaluator | Vrinda Venugopal M | 11/11/2026 |
