-- Durable mapping between provider records and local numeric books.id values.
CREATE TABLE presentation_products (
  provider VARCHAR(20) NOT NULL,
  provider_id VARCHAR(120) NOT NULL,
  book_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, provider_id),
  KEY idx_presentation_products_book (book_id),
  CONSTRAINT fk_presentation_products_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_presentation_products_provider CHECK (provider IN ('openlibrary', 'googlebooks'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
