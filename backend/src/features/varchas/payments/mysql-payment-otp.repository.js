import { randomUUID } from 'node:crypto';
import { withTransaction } from '../../uditi/shared/transaction.js';

export function createMySqlPaymentOtpRepository(pool) {
  return {
    async create({ id = randomUUID(), userId, paymentMethod, otpHash, expiresAt, cooldownMs = 60_000 }) {
      return withTransaction(pool, async connection => {
        await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
        const [rows] = await connection.query(
          `SELECT id, created_at AS createdAt FROM payment_otp_challenges
            WHERE user_id = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [userId]
        );
        const previous = rows[0];
        if (previous) {
          const resendAt = new Date(new Date(previous.createdAt).getTime() + cooldownMs);
          if (resendAt > new Date()) return { cooldown: true, resendAt };
          await connection.query('UPDATE payment_otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [previous.id]);
        }
        await connection.query(
          `INSERT INTO payment_otp_challenges
             (id, user_id, payment_method, otp_hash, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
          [id, userId, paymentMethod, otpHash, expiresAt]
        );
        return { id, expiresAt, resendAt: new Date(Date.now() + cooldownMs) };
      });
    },

    async invalidate(id, userId) {
      await pool.query('UPDATE payment_otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND consumed_at IS NULL', [id, userId]);
    },

    async verify({ id, userId, otpHash, connection = pool }) {
      const [rows] = await connection.query(
        `SELECT id, payment_method AS paymentMethod, otp_hash AS otpHash,
                expires_at AS expiresAt, otp_attempts AS otpAttempts, consumed_at AS consumedAt
           FROM payment_otp_challenges WHERE id = ? AND user_id = ? FOR UPDATE`,
        [id, userId]
      );
      const challenge = rows[0];
      if (!challenge) return { ok: false, reason: 'invalid' };
      if (challenge.consumedAt) return { ok: false, reason: 'used' };
      if (new Date(challenge.expiresAt) <= new Date()) {
        await connection.query('UPDATE payment_otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        return { ok: false, reason: 'expired' };
      }
      if (Number(challenge.otpAttempts) >= 5) {
        await connection.query('UPDATE payment_otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        return { ok: false, reason: 'attempts_exceeded' };
      }
      if (challenge.otpHash !== otpHash) {
        const nextAttempts = Number(challenge.otpAttempts) + 1;
        await connection.query(
          `UPDATE payment_otp_challenges
              SET otp_attempts = ?, consumed_at = IF(? >= 5, CURRENT_TIMESTAMP, consumed_at)
            WHERE id = ?`,
          [nextAttempts, nextAttempts, id]
        );
        return { ok: false, reason: nextAttempts >= 5 ? 'attempts_exceeded' : 'incorrect' };
      }
      await connection.query('UPDATE payment_otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      return { ok: true, paymentMethod: challenge.paymentMethod };
    },
  };
}
