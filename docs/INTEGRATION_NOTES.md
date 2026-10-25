# Catalogue and account integration notes

## Live catalogue

`GET /api/catalogue/books` and `/filters` are served by the Uditi catalogue integration in `backend/src/features/uditi/catalogue/open-library.js`. Open Library Search returns current work records and provider IDs; covers use the Covers API; detail lookups fetch the work record and consult the Read API. Search requests are cached briefly, bounded, throttled and timed out. Configure `OPEN_LIBRARY_USER_AGENT` with an identifying client name and contact before deployment.

Open Library has no retail price or storefront inventory, so those controls are omitted. Its search endpoint exposes pagination and publication year; title/year sorting is applied to each returned page because the provider does not document a title sort parameter. A search-by-ISBN uses Open Library's general query. Results that only provide work IDs are not yet compatible with the SQL cart's numeric `books.id` foreign key, so adding those results to cart needs a coordinated cross-feature mapping with Vrinda and Varchas.

## Reviews

The review API supports GET and POST /api/books/:bookId/reviews plus owner-only PATCH and DELETE. It accepts numeric local books.id values and stable Open Library work IDs. Customer reviews use the signed-in user session; demo reviews have explicit markers and no user or purchase record. New databases include book_reviews in backend/database/schema.sql; existing databases must apply the additive files listed in backend/database/migrations/README.md. Demo rows are excluded in production.

## Login and registration

The existing login endpoint and Vrinda registration route now mount with the shared MySQL pool when `DB_NAME` and `DB_USER` are configured. Login uses the existing `users` table password hash and server-side session. Local development without database configuration returns a dependency-unavailable response; it does not simulate login or account creation. Production still needs the existing Varchas adapter module and persistent session store as documented in the feature README.
