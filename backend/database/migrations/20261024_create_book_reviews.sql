-- Isolated folio review migration proposal. Apply once Uditi has reviewed it.
-- Safe for existing rows; creates only the new review table.
CREATE TABLE book_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id VARCHAR(80) NOT NULL COMMENT 'Stable Open Library work ID, e.g. works/OL123W',
  user_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  content VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_book_reviews_book_user (book_id, user_id),
  KEY idx_book_reviews_book_created (book_id, created_at),
  CONSTRAINT fk_book_reviews_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_book_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_book_reviews_content CHECK (CHAR_LENGTH(TRIM(content)) BETWEEN 10 AND 2000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
