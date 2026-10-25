-- Add a stable Open Library work association for locally managed products.
-- Existing books remain unchanged and can continue to match through valid ISBNs.
ALTER TABLE books
  ADD COLUMN open_library_work_id VARCHAR(32) NULL AFTER isbn,
  ADD UNIQUE KEY uq_books_open_library_work_id (open_library_work_id),
  ADD CONSTRAINT chk_books_open_library_work_id
    CHECK (open_library_work_id IS NULL OR open_library_work_id REGEXP '^works/OL[0-9]+W$');
