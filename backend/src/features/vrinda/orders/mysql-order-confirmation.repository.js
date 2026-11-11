export function createMySqlOrderConfirmationRepository(pool) {
  return {
    async ensure(orderId, connection = pool) {
      await connection.query('INSERT IGNORE INTO order_confirmation_email_deliveries (order_id) VALUES (?)', [orderId]);
    },
    async claim(orderId) {
      const [result] = await pool.query(
        `UPDATE order_confirmation_email_deliveries
            SET status = 'sending', attempts = attempts + 1,
                lease_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 MINUTE), last_error_category = NULL
          WHERE order_id = ? AND (status = 'pending' OR (status = 'sending' AND lease_until < UTC_TIMESTAMP()))`,
        [orderId]
      );
      return result.affectedRows === 1;
    },
    async markSent(orderId) {
      await pool.query(
        `UPDATE order_confirmation_email_deliveries
            SET status = 'sent', sent_at = UTC_TIMESTAMP(), lease_until = NULL, last_error_category = NULL
          WHERE order_id = ? AND status = 'sending'`,
        [orderId]
      );
    },
    async markFailed(orderId, category) {
      await pool.query(
        `UPDATE order_confirmation_email_deliveries
            SET status = 'pending', lease_until = NULL, last_error_category = ?
          WHERE order_id = ? AND status = 'sending'`,
        [String(category || 'DELIVERY_FAILED').slice(0, 64), orderId]
      );
    },
  };
}
