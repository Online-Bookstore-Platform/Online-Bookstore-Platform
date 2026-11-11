CREATE TABLE IF NOT EXISTS order_confirmation_email_deliveries (
  order_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'sending', 'sent') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  lease_until DATETIME NULL,
  last_error_category VARCHAR(64) NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  KEY idx_order_confirmation_delivery_retry (status, lease_until),
  CONSTRAINT fk_order_confirmation_delivery_order FOREIGN KEY (order_id) REFERENCES orders(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
