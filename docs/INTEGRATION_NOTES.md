# Catalogue and account integration notes

## Live catalogue

`GET /api/catalogue/books` and `/filters` are served by the Uditi catalogue integration in `backend/src/features/uditi/catalogue/open-library.js`. Open Library Search returns current work records and provider IDs; covers use the Covers API; detail lookups fetch the work record and consult the Read API. Search requests are cached briefly, bounded, throttled and timed out. Configure `OPEN_LIBRARY_USER_AGENT` with an identifying client name and contact before deployment.

Open Library has no retail price or storefront inventory, so those controls are omitted. Its search endpoint exposes pagination and publication year; title/year sorting is applied to each returned page because the provider does not document a title sort parameter. A search-by-ISBN uses Open Library's general query. Results that only provide work IDs are not yet compatible with the SQL cart's numeric `books.id` foreign key, so adding those results to cart needs a coordinated cross-feature mapping with Vrinda and Varchas.

## Reviews

The review API is implemented under `GET/POST /api/books/:bookId/reviews`, plus owner-only `PATCH/DELETE` routes. It uses `works/OL…W` identifiers and the existing signed-in user session. Duplicate user/work reviews update in place. The API requires `book_reviews`; the isolated, non-destructive proposal is `backend/database/migrations/20261024_create_book_reviews.sql`. Uditi owns the shared schema/migration process and must review and integrate this migration before review persistence can be used. Do not claim persistence on a database where the migration has not been applied.

## Login and registration

The existing login endpoint and Vrinda registration route now mount with the shared MySQL pool when `DB_NAME` and `DB_USER` are configured. Login uses the existing `users` table password hash and server-side session. Local development without database configuration returns a dependency-unavailable response; it does not simulate login or account creation. Production still needs the existing Varchas adapter module and persistent session store as documented in the feature README.
