-- Expand order fulfillment independently from payment state. Keeps all existing
-- statuses and rows; the old values remain valid for historical orders.
ALTER TABLE orders
  MODIFY status ENUM('pending', 'pending_collection', 'payment_failed', 'paid', 'confirmed', 'processing',
    'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned')
    NOT NULL DEFAULT 'pending',
  MODIFY payment_status ENUM('pending', 'pending_collection', 'succeeded', 'failed', 'collected') NOT NULL DEFAULT 'pending';

ALTER TABLE orders
  ADD COLUMN stock_reserved TINYINT(1) NOT NULL DEFAULT 0 AFTER payment_status;

ALTER TABLE password_reset_tokens
  ADD COLUMN otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0;
