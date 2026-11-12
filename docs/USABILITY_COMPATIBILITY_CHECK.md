# Usability and Compatibility Check — Online Bookstore (Folio)

| | |
|---|---|
| Test cases | TC-UX-01 (USE-1), TC-COMP-01 (PORT-1, PORT-2) |
| Build | `main` with the sample data from `backend/database/seed.sql` |
| Executed on | 11 November 2026 |
| Prepared by | Vrinda Venugopal M (PES2UG24CS601) |

## 1. How it was run

The backend and the Vite frontend were run locally against a MySQL database loaded with the sample
data, signed in as the seeded customer. In Chromium the browser was driven with Playwright so that
every page was checked the same way at every screen size. Edge and Firefox were checked by hand on a
team laptop by repeating the same flow and the mobile-width check.

| Browser | Version | Status |
|---|---|---|
| Chromium (Chrome engine) | 153.0.8010.12 | Done (this report) |
| Microsoft Edge | Not recorded | Done (manual check) |
| Mozilla Firefox | Not recorded | Done (manual check) |
| Safari | — | Not available to the team (no macOS device) |

Screen sizes: desktop 1440×900, tablet 768×1024, mobile 390×844 (iPhone 13 profile).

## 2. TC-UX-01 — book details within 3 clicks (USE-1)

| Screen | Path | Clicks | Result |
|---|---|---:|---|
| Desktop | Home → **Discover** → book card → book details (`/books/6`, "A Tale of Two Cities") | 2 | Pass |
| Mobile | Home → **Discover** → book card → book details (`/books/6`) | 2 | Pass |

Observation: with Open Library unreachable, the catalogue showed "Loading books…" for about
**3.3 s** before falling back to the store catalogue (same cause as DEF-06). This is above the
3-second page-load target (PERF-4) during a provider outage only.

## 3. TC-COMP-01 — layout at desktop, tablet and mobile (PORT-2)

Each page was loaded at each size and checked for horizontal overflow (page wider than the
screen), a visible header/navigation, and its main heading.

| Page | Desktop | Tablet | Mobile |
|---|---|---|---|
| Home `/` | Pass | Pass | Pass |
| Catalogue `/catalogue` | Pass | Pass | Pass |
| Categories `/categories` | Pass | Pass | Pass |
| About `/about` | Pass | Pass | Pass |
| Sign in `/login` | Pass | Pass | Pass |
| Register `/register` | Pass | Pass | Pass |
| Cart `/cart` | Pass | Pass | Pass |
| Checkout `/checkout` | Pass | Pass | Pass |
| Orders `/orders` | Pass | Pass | Pass |
| Admin catalogue `/admin` | Pass | Pass | Pass |
| Inventory `/inventory` | Pass (shows "Administrator access is required" to a customer) | Pass | Pass |

- No page overflowed horizontally at any size (0 px).
- No JavaScript errors were raised on any page.
- On mobile the catalogue filters collapse behind a **Filters** button, and book details stack
  into a single column; the cart is single-column at tablet width.

## 4. Result

| Test case | Chromium | Edge | Firefox | Safari |
|---|---|---|---|---|
| TC-UX-01 | Pass (2 clicks) | Pass | Pass | Not available |
| TC-COMP-01 (PORT-2 screen sizes) | Pass | Pass | Pass | Not available |
| TC-COMP-01 (PORT-1 browsers) | Pass | Pass | Pass | Not available |

Safari could not be tested because no one in the team has a macOS or iOS device. This is recorded in
`docs/DEVIATIONS.md`.
