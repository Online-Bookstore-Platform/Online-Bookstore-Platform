# Architecture

The repository begins as a client/server scaffold aligned with the supplied project documents: React in the browser, an Express HTTP application, and MySQL planned for a later implementation. This task adds no persistence or feature APIs.

The Vite frontend owns shared layout, route composition, design tokens, and the static homepage. Each owner has a separate feature folder; route declarations remain integration-owned. The shared layout wraps every route in one navigation and footer. Unknown paths render a not-found page.

The backend separates Express application configuration (`src/app.js`) from process startup (`src/server.js`). It exposes only `GET /api/health`. Future route/controller/service/repository/model work has designated directories; these are extension points, not implemented features. No database connection, schema, models, or credentials are included.

The UI is a responsive, bookstore-specific interpretation of editorial product presentation: neutral colors, large type, generous spacing, CSS-created sample book covers, accessible landmarks, visible focus, and reduced-motion support. No external image or font service is required.
