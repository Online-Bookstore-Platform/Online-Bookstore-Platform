-- Apply after 20261024_create_book_reviews.sql. Adds local book relationships
-- and clearly marked, user-less demo rows without deleting existing reviews.
ALTER TABLE book_reviews
  MODIFY user_id BIGINT UNSIGNED NULL,
  ADD COLUMN local_book_id BIGINT UNSIGNED NULL AFTER book_id,
  ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 AFTER user_id,
  ADD COLUMN demo_label VARCHAR(80) NULL AFTER is_demo,
  ADD COLUMN demo_key VARCHAR(120) NULL AFTER demo_label,
  ADD UNIQUE KEY uq_book_reviews_demo_key (demo_key),
  ADD KEY idx_book_reviews_local_created (local_book_id, created_at),
  ADD CONSTRAINT fk_book_reviews_local_book FOREIGN KEY (local_book_id) REFERENCES books (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT chk_book_reviews_kind CHECK (
    (is_demo = 0 AND demo_key IS NULL AND demo_label IS NULL)
    OR (is_demo = 1 AND demo_key IS NOT NULL AND demo_label IS NOT NULL)
  );
