# Database migrations

`npm run db:setup` creates an empty database from the current `schema.sql`. On an
existing database it records and applies additive lifecycle/OTP migrations
once, while checking the existing COD and reset-token prerequisites first.
Applied migration names are kept in `schema_migrations`.
Setup does not drop tables or delete rows. `npm run db:reset` is the separate,
destructive development-only command; never use it for a database with data.

For a manual migration, back up the database first, inspect `schema_migrations`,
then apply the next SQL file in date order. Record the filename only after it
completes. Do not rerun an untracked non-idempotent ALTER manually.

`20261029_add_cod_orders.sql` adds the COD method and independent payment status to earlier order tables; setup applies this prerequisite when it detects those columns are absent.

`20261028_create_password_reset_tokens.sql` adds hashed reset credentials when missing. Current password recovery stores a keyed hash of a six-digit OTP for five minutes, limits attempts, supports resend cooldowns, and invalidates all active sessions after password change.

New databases get the current review schema from `schema.sql`. For an existing database, apply `20261024_create_book_reviews.sql` if `book_reviews` does not exist, then apply `20261025_extend_book_reviews.sql`. Both changes preserve existing rows. The extension allows reviews for numeric local book IDs and clearly marked demo rows; local review rows retain a foreign key to `books.id`.

Apply `20261026_add_openlibrary_work_id.sql` to an existing database to link an explicitly registered Open Library work to a local Folio product. New databases get the column from `schema.sql`.

Apply `20261027_create_presentation_products.sql` to an existing database before enabling the local-only `CATALOGUE_DEMO_MODE`; new databases get the provider-to-local-ID mapping table from `schema.sql`.

Fictional editorial sample reviews support local classroom presentations and are clearly labelled in the UI. The review CLI idempotently seeds 30-40 varied reviews for every local catalogue book; detail-page reads can initialize a preview set for an individual book. Customer reviews remain separately identified, and sample reviews are excluded from production responses. Customer and presentation aggregates remain separately available. The CLI includes inactive local catalogue products and can seed an external work without a provider call:

```bash
cd backend
npm run reviews:seed   # idempotently adds 30-40 editorial samples for every local book
npm run reviews:seed -- --work works/OL25796244W  # initialize one discovery work directly
npm run reviews:clear  # removes only rows marked is_demo = 1
```

Both commands use `backend/.env`, refuse `NODE_ENV=production`, and never create users or purchase records. Demo reviews are excluded from production API responses.

`20261030_order_lifecycle_and_reset_otp.sql` expands fulfillment and collection states and adds stock-reservation tracking plus password-reset OTP attempt counts. `20261031_create_payment_otp_challenges.sql` adds the single-use simulation payment challenge table. Both are additive and preserve existing orders, tokens, and user data.

`20261031_create_order_confirmation_email_deliveries.sql` adds an additive delivery outbox keyed to an order. It records pending, in-flight, and sent states so post-commit confirmation email can be retried without duplicating ordinary repeated requests; it preserves all existing order data.

`20261101_create_contact_submissions.sql` adds the table used by the About page contact form. Submitted messages are stored for follow-up; the form only reports success after MySQL confirms the insert.
