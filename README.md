# Online Bookstore

Team 16's responsive bookstore project scaffold. It follows the React, Node.js/Express, and planned MySQL stack in the project SRS/SAD/STP. The site currently contains a static visual prototype and navigable feature placeholders; it does not implement bookstore workflows.

## Requirements

- Node.js 20 or newer and npm
- MySQL is planned for later work but is not needed to run this scaffold

## Run locally

In one terminal:

```bash
cd frontend
npm install
npm run dev
```

In another terminal:

```bash
cd backend
npm install
npm run dev
```

The Vite app opens at `http://localhost:5173`. The Express health endpoint is `http://localhost:5000/api/health` (or the `PORT` process environment variable). The `.env.example` files list configuration names; this scaffold does not automatically load `.env` files. No real credentials belong in source control.

Frontend production build:

```bash
cd frontend
npm run build
npm run preview
```

## Current routes

`/` is the complete static homepage. Varchas pages at `/login`, `/books/:bookId`, `/payment`, and `/admin` now have feature UI and API handlers. Database and order/cart services must be supplied through the adapter contract in [backend/src/features/varchas/README.md](backend/src/features/varchas/README.md); without it, data-dependent requests return 503. The other routes (`/catalogue`, `/checkout`, `/inventory`, `/register`, `/profile`, `/cart`, `/orders`, and `/orders/:orderId`) remain static placeholders owned by Uditi and Vrinda.

## Project structure

```text
frontend/  React + Vite application, shared UI, styles, static pages
backend/   Express app, health endpoint, and Varchas feature routes
docs/      Ownership, collaboration, and architecture notes
.github/   Pull request template
```

Feature ownership and integration rules are in [docs/TEAM_OWNERSHIP.md](docs/TEAM_OWNERSHIP.md) and [docs/DEVELOPMENT_GUIDELINES.md](docs/DEVELOPMENT_GUIDELINES.md). The supplied SRS, SAD, and STP remain at the repository root.

## Scope of this scaffold

No customer registration, profile management, catalogue browsing, cart, checkout, order creation/history/tracking, inventory, MySQL schema/connection, or seed data has been added. Varchas authentication, book-detail, payment, and administrator APIs require database/service adapters; the mock payment provider is opt-in and is never a real transaction. Sample homepage content and CSS covers are presentation-only.

Run backend unit and route tests with:

```bash
cd backend
npm test
```
