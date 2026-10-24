# Isolated migration proposals

`20261024_create_book_reviews.sql` is a non-destructive proposal for Uditi to review and integrate into the shared database migration process. It references the existing `users.id` primary key and uses an Open Library work ID as the stable external book identifier. The API expects this table before review endpoints are used. The central `schema.sql` was intentionally left unchanged.
