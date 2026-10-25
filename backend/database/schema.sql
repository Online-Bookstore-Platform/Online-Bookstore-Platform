-- =============================================================================
-- Online Bookstore - MySQL schema                                  (story #13)
-- =============================================================================
-- Target : MySQL 8.0.16+ (CHECK constraints are only enforced from 8.0.16)
-- Engine : InnoDB (foreign keys + transactions), utf8mb4
--
-- Apply to an existing, empty database:
--     mysql -u <user> -p <database> < backend/database/schema.sql
-- or let the project create the database and apply it:
--     cd backend && npm run db:setup          (add -- --reset to drop first)
--
-- The table structure and the rules each member's code must follow are written
-- up in backend/database/README.md - read it before adding tables or columns.
--
-- Design notes (SRS references in brackets)
--   * Referential integrity between users, orders, order items, books and
--     inventory is enforced with foreign keys                         [DB-2]
--   * Inventory can never go negative (CHECK) and every book has exactly one
--     inventory row, so stock updates are single-row, lockable writes [DB-3, BR-1]
--   * Order items snapshot the unit price at purchase time, so a later price
--     change never alters a confirmed order                           [BR-3]
--   * Orders and payments are never deleted along with their user/books; books
--     are soft-deleted through books.is_active instead                [DB-1]
--   * Duplicate orders / payments are blocked by unique keys         [SEC-5]
--   * No card data is stored anywhere - only the provider's reference [SEC-7]
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- users: customer and administrator accounts (role-based access, SEC-3)
--   Column names match the "users" adapter contract in
--   backend/src/features/varchas/README.md: name, email, role, password_hash
--   (exposed there as passwordHash). Hash only, never plain text.     [SEC-2]
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name              VARCHAR(100)    NOT NULL,
  email             VARCHAR(255)    NOT NULL,
  password_hash     VARCHAR(255)    NOT NULL,
  phone             VARCHAR(20)     NULL,
  role              ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
  terms_accepted_at DATETIME        NOT NULL,            -- accepted at registration     [LEG-3]
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),                     -- case-insensitive collation
  CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- sessions: server-side login sessions for the MySQL-backed express-session
--   store. Column names and types match the common express-mysql-session layout.
-- -----------------------------------------------------------------------------
CREATE TABLE sessions (
  session_id VARCHAR(128)     NOT NULL,
  expires    INT UNSIGNED     NOT NULL,
  data       MEDIUMTEXT       NULL,
  PRIMARY KEY (session_id),
  KEY idx_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(80)  NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- books: the catalogue. Stock lives in `inventory`, not here.
--   isbn is stored without hyphens (ISBN-10 or ISBN-13).
--   is_active = 0 hides a book from the catalogue ("removed" by an admin) while
--   keeping it available to old orders.
--   All prices are in one currency (INR); orders record it explicitly.
-- -----------------------------------------------------------------------------
CREATE TABLE books (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  isbn            VARCHAR(13)     NULL,
  open_library_work_id VARCHAR(32) NULL,
  title           VARCHAR(255)    NOT NULL,
  author          VARCHAR(150)    NOT NULL,
  category_id     INT UNSIGNED    NOT NULL,
  price           DECIMAL(10, 2)  NOT NULL,
  description     TEXT            NULL,
  cover_image_url VARCHAR(2048)   NULL,
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_books_isbn (isbn),
  UNIQUE KEY uq_books_open_library_work_id (open_library_work_id),
  KEY idx_books_title (title),
  KEY idx_books_author (author),
  KEY idx_books_category_price (category_id, price),
  KEY idx_books_price (price),
  CONSTRAINT fk_books_category FOREIGN KEY (category_id) REFERENCES categories (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_books_price CHECK (price >= 0),
  CONSTRAINT chk_books_isbn  CHECK (isbn IS NULL OR isbn REGEXP '^([0-9]{9}[0-9Xx]|[0-9]{13})$'),
  CONSTRAINT chk_books_open_library_work_id CHECK (open_library_work_id IS NULL OR open_library_work_id REGEXP '^works/OL[0-9]+W$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Stable provider identity mapping for local presentation products. Explicit
-- Folio products can be mapped here by verified ISBN without changing their data.
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

-- -----------------------------------------------------------------------------
-- inventory: exactly one row per book, holding the sellable quantity.
--   The CHECK makes overselling impossible even if application code is wrong.
-- -----------------------------------------------------------------------------
CREATE TABLE inventory (
  book_id    BIGINT UNSIGNED NOT NULL,
  quantity   INT             NOT NULL DEFAULT 0,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (book_id),
  CONSTRAINT fk_inventory_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_inventory_quantity CHECK (quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- inventory_adjustments: audit trail of manual stock changes made by an
-- administrator (who changed which book's stock, from what to what, and why).
-- Sales and cancellations are traceable through orders instead.   [SO-2]
-- -----------------------------------------------------------------------------
CREATE TABLE inventory_adjustments (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id         BIGINT UNSIGNED NOT NULL,
  admin_id        BIGINT UNSIGNED NOT NULL,
  quantity_before INT             NOT NULL,
  quantity_after  INT             NOT NULL,
  reason          VARCHAR(200)    NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inventory_adjustments_book (book_id, created_at),
  KEY idx_inventory_adjustments_admin (admin_id),
  CONSTRAINT fk_inventory_adjustments_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_inventory_adjustments_admin FOREIGN KEY (admin_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_inventory_adjustments_before CHECK (quantity_before >= 0),
  CONSTRAINT chk_inventory_adjustments_after CHECK (quantity_after >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- carts / cart_items: one cart per user. The cart stores no prices - the
-- current catalogue price is read at checkout and frozen into order_items.
-- Written by the cart feature (Vrinda); checkout only reads it.
-- -----------------------------------------------------------------------------
CREATE TABLE carts (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carts_user (user_id),
  CONSTRAINT fk_carts_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE cart_items (
  cart_id    BIGINT UNSIGNED NOT NULL,
  book_id    BIGINT UNSIGNED NOT NULL,
  quantity   INT UNSIGNED    NOT NULL DEFAULT 1,
  added_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cart_id, book_id),
  KEY idx_cart_items_book (book_id),
  CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES carts (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_cart_items_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- delivery_details: the delivery information a user entered at checkout, saved
-- so a page reload does not lose it. One set per user; the order copies it
-- (see `orders`) so editing it later never changes a placed order.
-- -----------------------------------------------------------------------------
CREATE TABLE delivery_details (
  user_id        BIGINT UNSIGNED NOT NULL,
  recipient_name VARCHAR(100)    NOT NULL,
  phone          VARCHAR(20)     NOT NULL,
  address_line1  VARCHAR(150)    NOT NULL,
  address_line2  VARCHAR(150)    NULL,
  city           VARCHAR(80)     NOT NULL,
  state          VARCHAR(80)     NOT NULL,
  postal_code    VARCHAR(12)     NOT NULL,
  country        VARCHAR(60)     NOT NULL,
  updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_delivery_details_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- orders: one row per order. orders.id is the internal key; order_number is the
-- customer-facing Order ID, set by the order service when the order is created.
--   status lifecycle (see backend/database/README.md):
--     pending -> paid -> confirmed -> processing -> shipped -> delivered
--     pending -> payment_failed -> pending (retry) ; ... -> cancelled
--   Delivery details are copied (snapshot) so later edits to delivery_details
--   never change a placed order.
--   idempotency_key lets the client retry "create order" safely: the same key
--   from the same user can only ever create one order.             [SEC-5]
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_number    VARCHAR(32)     NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  status          ENUM('pending', 'payment_failed', 'paid', 'confirmed', 'processing',
                       'shipped', 'delivered', 'cancelled')
                  NOT NULL DEFAULT 'pending',
  total_amount    DECIMAL(12, 2)  NOT NULL,
  currency        CHAR(3)         NOT NULL DEFAULT 'INR',
  recipient_name  VARCHAR(100)    NOT NULL,
  phone           VARCHAR(20)     NOT NULL,
  address_line1   VARCHAR(150)    NOT NULL,
  address_line2   VARCHAR(150)    NULL,
  city            VARCHAR(80)     NOT NULL,
  state           VARCHAR(80)     NOT NULL,
  postal_code     VARCHAR(12)     NOT NULL,
  country         VARCHAR(60)     NOT NULL,
  idempotency_key VARCHAR(100)    NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_order_number (order_number),
  UNIQUE KEY uq_orders_user_idempotency (user_id, idempotency_key),
  KEY idx_orders_user_created (user_id, created_at),
  KEY idx_orders_status (status),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_orders_total CHECK (total_amount >= 0),
  CONSTRAINT chk_orders_number CHECK (order_number REGEXP '^[A-Za-z0-9-]{4,32}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- order_items: the books of an order, with the price and title at purchase time.
-- -----------------------------------------------------------------------------
CREATE TABLE order_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   BIGINT UNSIGNED NOT NULL,
  book_id    BIGINT UNSIGNED NOT NULL,
  book_title VARCHAR(255)    NOT NULL,                   -- snapshot, survives renames
  quantity   INT UNSIGNED    NOT NULL,
  unit_price DECIMAL(10, 2)  NOT NULL,                   -- snapshot            [BR-3]
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_items_order_book (order_id, book_id),
  KEY idx_order_items_book (book_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_order_items_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_order_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_order_items_price CHECK (unit_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- order_status_history: every status change of an order, oldest first, for
-- order tracking and traceability.                                 [SO-2]
-- -----------------------------------------------------------------------------
CREATE TABLE order_status_history (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(20)     NULL,                      -- NULL for the first entry
  to_status   VARCHAR(20)     NOT NULL,
  changed_by  BIGINT UNSIGNED NULL,                      -- NULL = the system
  note        VARCHAR(255)    NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_status_history_order (order_id, id),
  CONSTRAINT fk_order_status_history_order FOREIGN KEY (order_id) REFERENCES orders (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_order_status_history_user FOREIGN KEY (changed_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- book_reviews: customer feedback for local products and provider discovery
-- records. Demo-only rows have no user identity or purchase claim.
-- -----------------------------------------------------------------------------
CREATE TABLE book_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id VARCHAR(80) NOT NULL COMMENT 'Local key local:<books.id> or provider work ID',
  local_book_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  demo_label VARCHAR(80) NULL,
  demo_key VARCHAR(120) NULL,
  rating TINYINT UNSIGNED NOT NULL,
  content VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_book_reviews_book_user (book_id, user_id),
  UNIQUE KEY uq_book_reviews_demo_key (demo_key),
  KEY idx_book_reviews_book_created (book_id, created_at),
  KEY idx_book_reviews_local_created (local_book_id, created_at),
  CONSTRAINT fk_book_reviews_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_book_reviews_local_book FOREIGN KEY (local_book_id) REFERENCES books (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_book_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_book_reviews_content CHECK (CHAR_LENGTH(TRIM(content)) BETWEEN 10 AND 2000),
  CONSTRAINT chk_book_reviews_kind CHECK (
    (is_demo = 0 AND demo_key IS NULL AND demo_label IS NULL)
    OR (is_demo = 1 AND demo_key IS NOT NULL AND demo_label IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- payments: one row per payment ATTEMPT (an order may have several: a declined
-- attempt can be retried). Status values are exactly the outcomes of the
-- payment feature (Varchas): pending, succeeded, failed, cancelled, timed_out.
--   * idempotency_key is globally unique: a retried request with the same key
--     can only ever create one attempt                               [SEC-5]
--   * at most ONE pending attempt per order (active_order_id)
--   * at most ONE succeeded payment per order (succeeded_order_id), so an order
--     can never be paid twice
--   * provider_reference is the provider's id only - never card data [SEC-7]
--   Foreign keys have no ON UPDATE CASCADE because order_id feeds the generated
--   columns below; payments are never cascade-deleted with orders.   [DB-1]
-- -----------------------------------------------------------------------------
CREATE TABLE payments (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotency_key    VARCHAR(128)    NOT NULL,
  order_id           BIGINT UNSIGNED NOT NULL,
  user_id            BIGINT UNSIGNED NOT NULL,
  amount             DECIMAL(12, 2)  NOT NULL,
  currency           CHAR(3)         NOT NULL DEFAULT 'INR',
  status             ENUM('pending', 'succeeded', 'failed', 'cancelled', 'timed_out')
                     NOT NULL DEFAULT 'pending',
  provider_reference VARCHAR(100)    NULL,
  provider_order_id  VARCHAR(100)    NULL,
  created_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  active_order_id    BIGINT UNSIGNED
                     GENERATED ALWAYS AS (IF(status = 'pending', order_id, NULL)) STORED,
  succeeded_order_id BIGINT UNSIGNED
                     GENERATED ALWAYS AS (IF(status = 'succeeded', order_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_idempotency (idempotency_key),
  UNIQUE KEY uq_payments_provider_reference (provider_reference),
  UNIQUE KEY uq_payments_provider_order (provider_order_id),
  UNIQUE KEY uq_payments_one_pending_per_order (active_order_id),
  UNIQUE KEY uq_payments_one_success_per_order (succeeded_order_id),
  KEY idx_payments_order (order_id),
  KEY idx_payments_user (user_id),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_payments_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
