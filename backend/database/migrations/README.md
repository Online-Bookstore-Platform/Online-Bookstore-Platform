# Isolated migration proposals

New databases get the current review schema from `schema.sql`. For an existing database, apply `20261024_create_book_reviews.sql` if `book_reviews` does not exist, then apply `20261025_extend_book_reviews.sql`. Both changes preserve existing rows. The extension allows reviews for numeric local book IDs and clearly marked demo rows; local review rows retain a foreign key to `books.id`.

Apply `20261026_add_openlibrary_work_id.sql` to an existing database to link an explicitly registered Open Library work to a local Folio product. New databases get the column from `schema.sql`.

Apply `20261027_create_presentation_products.sql` to an existing database before enabling the local-only `CATALOGUE_DEMO_MODE`; new databases get the provider-to-local-ID mapping table from `schema.sql`.

Development preview reviews are managed separately from schema setup. Detail-page GET requests lazily initialize 8–12 deterministic, varied preview reviews for local and discovery IDs in non-production environments. Customer and preview aggregates are reported separately. The CLI initializes all active local products regardless of stock and can seed an external work without a provider call:

```bash
cd backend
npm run reviews:seed   # idempotently adds 8–12 preview reviews for active local products
npm run reviews:seed -- --work works/OL25796244W  # initialize one discovery work directly
npm run reviews:clear  # removes only rows marked is_demo = 1
```

Both commands use `backend/.env`, refuse `NODE_ENV=production`, and never create users or purchase records. Demo reviews are excluded from production API responses.
