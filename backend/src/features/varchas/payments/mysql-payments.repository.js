export function createMySqlPaymentsRepository(pool) {
  return {
    async recordSimulatedSuccess({ challengeId, orderId, userId, amount, currency }, db = pool) {
      await db.query(
        `INSERT INTO payments (idempotency_key, order_id, user_id, amount, currency, status, provider_reference)
         VALUES (?, ?, ?, ?, ?, 'succeeded', ?)`,
        [`payment-otp-${challengeId}`, orderId, userId, amount, currency, `folio-demo-${challengeId}`]
      );
    },
  };
}
