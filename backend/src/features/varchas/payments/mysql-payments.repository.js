export function createMySqlPaymentsRepository(pool) {
  const map = row => row && ({
    id: String(row.id), orderId: String(row.order_id), customerId: String(row.user_id),
    amount: Number(row.amount), currency: row.currency, status: row.status,
    idempotencyKey: row.idempotency_key,
    providerReference: row.provider_reference,
  });
  return {
    async findByIdempotencyKey(key) {
      const [rows] = await pool.query('SELECT * FROM payments WHERE idempotency_key = ? LIMIT 1', [key]);
      return map(rows[0]);
    },
    async findById(id, db = pool) {
      const [rows] = await db.query('SELECT * FROM payments WHERE id = ? LIMIT 1', [id]);
      return map(rows[0]);
    },
    async createPending({ idempotencyKey, orderId, customerId, amount, currency }) {
      const [result] = await pool.query(
        `INSERT INTO payments (idempotency_key, order_id, user_id, amount, currency, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`, [idempotencyKey, orderId, customerId, amount, currency]
      );
      return this.findById(result.insertId);
    },
    async updateStatus(id, status, providerReference, db = pool) {
      const [result] = await db.query(
        `UPDATE payments SET status = ?, provider_reference = COALESCE(?, provider_reference)
          WHERE id = ? AND status = 'pending'`, [status, providerReference, id]
      );
      if (!result.affectedRows && status !== 'pending') {
        const current = await this.findById(id, db);
        if (current?.status !== status) return current;
      }
      return this.findById(id, db);
    },
  };
}
