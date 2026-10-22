# Architecture

The repository is a client/server application aligned with the supplied project documents: React in the browser, an Express HTTP application, and MySQL planned for persistence. Varchas's feature API modules use injected repositories/services; the repository has not yet supplied a MySQL adapter, schema, persistent session store, or Vrinda order/cart services.

The Vite frontend owns shared layout, route composition, design tokens, and the static homepage. Each owner has a separate feature folder; route declarations remain integration-owned. The shared layout wraps every route in one navigation and footer. Unknown paths render a not-found page.

The backend separates Express application configuration (`src/app.js`) from process startup (`src/server.js`). It exposes `GET /api/health` and Varchas authentication, book detail, administrator catalogue, and payment routes. Without a configured adapter, data-dependent routes fail with HTTP 503 instead of writing to ephemeral in-memory stores. The feature adapter contract is documented in `backend/src/features/varchas/README.md`. No MySQL schema or credentials are included.

The UI is a responsive, bookstore-specific interpretation of editorial product presentation: neutral colors, large type, generous spacing, CSS-created sample book covers, accessible landmarks, visible focus, and reduced-motion support. No external image or font service is required.
