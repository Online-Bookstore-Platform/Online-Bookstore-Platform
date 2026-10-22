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

The Vite app opens at `http://localhost:5173`. The Express health endpoint is `http://localhost:5000/api/health` (or the `PORT` process environment variable). The `.env.example` documents future configuration names; the scaffold does not load `.env` files or use database/payment settings. No real credentials belong in source control.

Frontend production build:

```bash
cd frontend
npm run build
npm run preview
```

## Current routes

`/` is the complete static homepage. The following routes use shared placeholder screens: `/login`, `/books/:bookId`, `/payment`, `/admin`, `/catalogue`, `/checkout`, `/inventory`, `/register`, `/profile`, `/cart`, `/orders`, and `/orders/:orderId`. These pages identify the owner and planned feature; they contain no working workflows.

## Project structure

```text
frontend/  React + Vite application, shared UI, styles, static pages
backend/   Minimal Express app with GET /api/health only
docs/      Ownership, collaboration, and architecture notes
.github/   Pull request template
```

Feature ownership and integration rules are in [docs/TEAM_OWNERSHIP.md](docs/TEAM_OWNERSHIP.md) and [docs/DEVELOPMENT_GUIDELINES.md](docs/DEVELOPMENT_GUIDELINES.md). The supplied SRS, SAD, and STP remain at the repository root.

## Scope of this scaffold

No authentication, registration, search, catalogue, book detail, cart, checkout, payment, order, inventory, administration, database schema, MySQL connection, seed data, or feature API has been added. Sample book content and CSS covers on the homepage are presentation-only.
