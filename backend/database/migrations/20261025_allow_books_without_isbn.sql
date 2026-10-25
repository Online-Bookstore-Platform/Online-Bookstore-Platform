-- ISBN is optional for legitimate books that do not carry one. MySQL UNIQUE
-- indexes allow multiple NULL values, while retaining uniqueness for supplied ISBNs.
ALTER TABLE books
  DROP CHECK chk_books_isbn,
  MODIFY isbn VARCHAR(13) NULL;

ALTER TABLE books
  ADD CONSTRAINT chk_books_isbn
    CHECK (isbn IS NULL OR isbn REGEXP '^([0-9]{9}[0-9Xx]|[0-9]{13})$');
