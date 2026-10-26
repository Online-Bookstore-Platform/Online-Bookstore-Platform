-- Add a separately tracked cash-on-delivery order state. Existing orders remain
-- card orders with their existing payment state.
ALTER TABLE orders
  MODIFY status ENUM('pending', 'pending_collection', 'payment_failed', 'paid', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  ADD COLUMN payment_method ENUM('card', 'upi', 'netbanking', 'cod') NOT NULL DEFAULT 'card' AFTER currency,
  ADD COLUMN payment_status ENUM('pending', 'pending_collection', 'succeeded', 'failed') NOT NULL DEFAULT 'pending' AFTER payment_method;
