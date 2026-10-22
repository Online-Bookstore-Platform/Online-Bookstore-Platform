-- =============================================================================
-- Online Bookstore - MySQL schema                                  (issue #13)
-- =============================================================================
-- Target : MySQL 8.0.16+ (CHECK constraints are only enforced from 8.0.16)
-- Engine : InnoDB (foreign keys + transactions), utf8mb4
--
-- Apply to an existing, empty database:
--     mysql -u <user> -p <database> < database/schema.sql
-- or let the project do it for you (creates the database if needed):
--     cd server && npm run db:setup
--
-- Design notes (SRS references in brackets)
--   * Referential integrity between customers, orders, order items, books and
--     inventory is enforced with foreign keys                         [DB-2]
--   * Inventory can never go negative (CHECK) and every book has exactly one
--     inventory row, so stock updates are single-row, lockable writes [DB-3, BR-1]
--   * Order items snapshot the unit price at purchase time, so a later price
--     change never alters a confirmed order                           [BR-3]
--   * Orders are never deleted along with their customer/books; books are
--     soft-deleted via books.is_active instead                        [DB-1]
--   * Duplicate orders / payments are blocked by unique keys         [SEC-5]
--   * No card data is stored anywhere - only the gateway's reference [SEC-7, LEG-2]
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- customers: customer and administrator accounts (role-based access, SEC-3)
-- -----------------------------------------------------------------------------
CREATE TABLE customers (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name         VARCHAR(100)    NOT NULL,
  email             VARCHAR(255)    NOT NULL,
  password_hash     VARCHAR(255)    NOT NULL,            -- hash only, never plain text [SEC-2]
  phone             VARCHAR(20)     NULL,
  role              ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
  terms_accepted_at DATETIME        NOT NULL,            -- accepted at registration     [LEG-3]
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email),
  CONSTRAINT chk_customers_email CHECK (email LIKE '%_@_%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
-- -----------------------------------------------------------------------------
CREATE TABLE books (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  isbn            VARCHAR(13)     NOT NULL,
  title           VARCHAR(255)    NOT NULL,
  author          VARCHAR(150)    NOT NULL,
  category_id     INT UNSIGNED    NOT NULL,
  price           DECIMAL(10, 2)  NOT NULL,
  description     TEXT            NULL,
  cover_image_url VARCHAR(500)    NULL,
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_books_isbn (isbn),
  KEY idx_books_title (title),
  KEY idx_books_author (author),
  KEY idx_books_category_price (category_id, price),
  KEY idx_books_price (price),
  CONSTRAINT fk_books_category FOREIGN KEY (category_id) REFERENCES categories (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_books_price CHECK (price >= 0),
  CONSTRAINT chk_books_isbn  CHECK (isbn REGEXP '^([0-9]{9}[0-9Xx]|[0-9]{13})$')
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
  CONSTRAINT fk_inventory_adjustments_admin FOREIGN KEY (admin_id) REFERENCES customers (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_inventory_adjustments_before CHECK (quantity_before >= 0),
  CONSTRAINT chk_inventory_adjustments_after CHECK (quantity_after >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- carts / cart_items: one cart per customer. The cart stores no prices - the
-- current catalogue price is read at checkout and frozen into order_items.
-- -----------------------------------------------------------------------------
CREATE TABLE carts (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carts_customer (customer_id),
  CONSTRAINT fk_carts_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
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
-- delivery_details: delivery information entered during checkout, kept against
-- the cart until the order exists (the order then copies it, see `orders`).
-- -----------------------------------------------------------------------------
CREATE TABLE delivery_details (
  cart_id        BIGINT UNSIGNED NOT NULL,
  recipient_name VARCHAR(100)    NOT NULL,
  phone          VARCHAR(20)     NOT NULL,
  address_line1  VARCHAR(150)    NOT NULL,
  address_line2  VARCHAR(150)    NULL,
  city           VARCHAR(80)     NOT NULL,
  state          VARCHAR(80)     NOT NULL,
  postal_code    VARCHAR(12)     NOT NULL,
  country        VARCHAR(60)     NOT NULL,
  updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cart_id),
  CONSTRAINT fk_delivery_details_cart FOREIGN KEY (cart_id) REFERENCES carts (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- orders: one row per confirmed purchase; orders.id is the customer-facing
-- Order ID. Delivery details are copied (snapshot) so later edits to the cart's
-- delivery details never change a placed order.
--   idempotency_key lets the client retry "place order" safely: the same key
--   from the same customer can only ever create one order.        [SEC-5]
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id     BIGINT UNSIGNED NOT NULL,
  status          ENUM('Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled')
                  NOT NULL DEFAULT 'Pending',
  total_amount    DECIMAL(12, 2)  NOT NULL,
  recipient_name  VARCHAR(100)    NOT NULL,
  phone           VARCHAR(20)     NOT NULL,
  address_line1   VARCHAR(150)    NOT NULL,
  address_line2   VARCHAR(150)    NULL,
  city            VARCHAR(80)     NOT NULL,
  state           VARCHAR(80)     NOT NULL,
  postal_code     VARCHAR(12)     NOT NULL,
  country         VARCHAR(60)     NOT NULL,
  idempotency_key VARCHAR(64)     NULL,
  placed_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_customer_idempotency (customer_id, idempotency_key),
  KEY idx_orders_customer_placed (customer_id, placed_at),
  KEY idx_orders_status (status),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_orders_total CHECK (total_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- order_items: books in an order, with the unit price frozen at purchase time.
-- -----------------------------------------------------------------------------
CREATE TABLE order_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   BIGINT UNSIGNED NOT NULL,
  book_id    BIGINT UNSIGNED NOT NULL,
  quantity   INT UNSIGNED    NOT NULL,
  unit_price DECIMAL(10, 2)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_items_order_book (order_id, book_id),
  KEY idx_order_items_book (book_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_order_items_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_order_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_order_items_price    CHECK (unit_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- payments: one row per payment attempt. order_id stays NULL for an attempt
-- that failed before any order was created. Only the gateway's reference is
-- stored - never card details.                                   [SEC-7, LEG-2]
--   * gateway_reference is unique, so the same gateway result cannot be recorded twice
--   * an order can have many failed attempts but at most ONE succeeded payment
--     (succeeded_order_id is a generated column that is NULL unless the payment
--     succeeded, and NULLs do not collide in a unique key)
-- -----------------------------------------------------------------------------
CREATE TABLE payments (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id        BIGINT UNSIGNED NOT NULL,
  order_id           BIGINT UNSIGNED NULL,
  amount             DECIMAL(12, 2)  NOT NULL,
  currency           CHAR(3)         NOT NULL DEFAULT 'INR',
  status             ENUM('Pending', 'Succeeded', 'Failed') NOT NULL DEFAULT 'Pending',
  gateway_reference  VARCHAR(100)    NULL,
  failure_reason     VARCHAR(255)    NULL,
  created_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  succeeded_order_id BIGINT UNSIGNED
    GENERATED ALWAYS AS (CASE WHEN status = 'Succeeded' THEN order_id END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_gateway_reference (gateway_reference),
  UNIQUE KEY uq_payments_one_success_per_order (succeeded_order_id),
  KEY idx_payments_customer (customer_id),
  KEY idx_payments_order (order_id),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  -- No ON UPDATE CASCADE here: MySQL forbids cascading actions on a column that
  -- feeds a generated column / CHECK (order ids never change anyway).
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_payments_amount CHECK (amount >= 0),
  CONSTRAINT chk_payments_success_has_order CHECK (status <> 'Succeeded' OR order_id IS NOT NULL),
  CONSTRAINT chk_payments_success_has_reference CHECK (status <> 'Succeeded' OR gateway_reference IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
