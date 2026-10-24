# Online Bookstore

Team 16's responsive bookstore project built with React, Node.js/Express, and MySQL. It includes team-owned account, cart, catalogue, checkout, inventory, and order features alongside the approved folio visual design.

## Requirements

- Node.js 20 or newer and npm
- MySQL 8.0.16+ for registration, login, cart and other database-backed features

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

`/` preserves the approved folio homepage. `/catalogue` uses live Open Library search metadata and `/books/:bookId` displays the selected Open Library work. The existing `/login` and `/register` flows use the server session and Vrinda registration implementation when MySQL settings are configured. See [integration notes](docs/INTEGRATION_NOTES.md) for the required database/review handoffs and current external catalogue limitations.

## Project structure

```text
frontend/  React + Vite application, shared UI, styles, static pages
backend/   Express app, health endpoint, and Varchas feature routes
docs/      Ownership, collaboration, and architecture notes
.github/   Pull request template
```

Feature ownership and integration rules are in [docs/TEAM_OWNERSHIP.md](docs/TEAM_OWNERSHIP.md) and [docs/DEVELOPMENT_GUIDELINES.md](docs/DEVELOPMENT_GUIDELINES.md). The supplied SRS, SAD, and STP remain at the repository root.

## Database-backed features

The repository includes a MySQL schema, database connection and team-owned registration, cart, order, checkout, inventory and authentication features. Configure the database variables in `backend/.env.example` and set `SESSION_SECRET` before starting the backend with that environment. Production additionally requires Varchas's persistent session store adapter. Payment mock mode is opt-in and never represents a real transaction. The review migration is a proposal pending Uditi's integration into the shared migration process.

Run backend unit and route tests with:

```bash
cd backend
npm test
```
