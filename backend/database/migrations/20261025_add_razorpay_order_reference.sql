ALTER TABLE payments
  ADD COLUMN provider_order_id VARCHAR(100) NULL AFTER provider_reference,
  ADD UNIQUE KEY uq_payments_provider_order (provider_order_id);
