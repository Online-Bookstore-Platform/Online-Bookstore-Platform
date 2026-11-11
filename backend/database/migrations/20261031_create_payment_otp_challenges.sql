CREATE TABLE payment_otp_challenges (
  id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  payment_method ENUM('card', 'upi', 'netbanking') NOT NULL,
  otp_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payment_otp_user_created (user_id, created_at),
  CONSTRAINT fk_payment_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
