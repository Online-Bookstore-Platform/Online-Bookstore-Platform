# Final Build Verification and Development Freeze (Issue #28)

Verified on 29 October 2026 by Uditi Mourya (PES2UG24CS565) on the integrated build: `main` @ `cfeb5a4` plus the
Sprint 2 testing branch (catalogue offline fallback, transaction deadlock retry, STP system tests, this document,
the test report and the demo video).

## Checklist

| Item | Result |
|---|---|
| Feature pull requests from all three members reviewed and merged into `main` (#20 Uditi, #31 Varchas, #21 Vrinda) | Done |
| Backend: `cd backend && npm test`: 308 tests, 302 pass, 0 fail, 6 known defects tracked as `todo` | Pass |
| Frontend: `node --test "src/**/*.test.js"`: 85 / 85 | Pass |
| Frontend production build: `npm run build` | Pass |
| Application runs end to end (`npm run dev` in `backend/` and `frontend/`, MySQL 8 schema + seed): sign in, browse, search, cart, checkout, payment, order history, tracking, admin catalogue, inventory | Pass (recorded in the demo) |
| Critical defects addressed | Done: no open Critical defect; the two found during testing in the purchase path (DEF-07 concurrent checkout deadlock, DEF-08 catalogue error page during provider outage) are fixed |
| Test execution report and defect log committed | `docs/TEST_EXECUTION_REPORT.md` |
| Sprint 2 demo video committed | `docs/demo/sprint2-demo.mp4` (1 min 37 s, captioned, no audio) |
| Architecture, setup and team docs | `README.md`, `docs/ARCHITECTURE.md`, `docs/INTEGRATION_NOTES.md`, `docs/TEAM_OWNERSHIP.md` |
| Final documentation / RTM (#26) and Sprint 1 video (#29) | Owned by Varchas and Vrinda: tracked in their issues |

## Open defects accepted for this release

They are documented, not fixed, because the build is frozen (no new features). See the defect log in `docs/TEST_EXECUTION_REPORT.md`.

* DEF-01 (High): customers cannot cancel an order.
* DEF-02 (High): no administrator order-status management.
* DEF-03 (Medium): duplicate ISBN on "add book" returns 500.
* DEF-04, DEF-05, DEF-06, DEF-09, DEF-10 (Low).

## Development freeze

From this commit on, `main` takes only fixes for defects in the log and documentation. No new features.
