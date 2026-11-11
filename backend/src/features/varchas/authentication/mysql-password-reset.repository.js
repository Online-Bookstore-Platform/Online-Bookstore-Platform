/** MySQL persistence for hashed, single-use password reset credentials. */
export function createMySqlPasswordResetRepository(pool) {
  return {
    async findResetUserByEmail(email) {
      const [rows] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      return rows[0] ?? null;
    },
    async savePasswordReset(userId, tokenHash, validUntil) {
      const utcDateTime = validUntil.toISOString().slice(0, 19).replace('T', ' ');
      const [recent] = await pool.query('SELECT UNIX_TIMESTAMP(created_at) AS createdSeconds FROM password_reset_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
      if (recent[0] && Date.now() - Number(recent[0].createdSeconds) * 1000 < 60_000) return false;
      await pool.query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [userId]);
      await pool.query('INSERT INTO password_reset_tokens (user_id, token_hash, valid_until) VALUES (?, ?, ?)', [userId, tokenHash, utcDateTime]);
      return true;
    },
    async verifyPasswordResetOtp(email, otpHash, resetProofHash, validUntil) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query(`SELECT t.id, t.token_hash AS tokenHash, t.otp_attempts AS attempts
          FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
          WHERE u.email = ? AND t.used_at IS NULL AND t.valid_until > UTC_TIMESTAMP()
          ORDER BY t.id DESC LIMIT 1 FOR UPDATE`, [email]);
        const row = rows[0];
        if (!row || row.attempts >= 5) { await connection.rollback(); return false; }
        if (row.tokenHash !== otpHash) {
          await connection.query('UPDATE password_reset_tokens SET otp_attempts = otp_attempts + 1 WHERE id = ?', [row.id]);
          await connection.commit(); return false;
        }
        const utcDateTime = validUntil.toISOString().slice(0, 19).replace('T', ' ');
        await connection.query('UPDATE password_reset_tokens SET token_hash = ?, valid_until = ?, otp_attempts = 0 WHERE id = ?', [resetProofHash, utcDateTime, row.id]);
        await connection.commit(); return true;
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
    async consumePasswordReset(tokenHash, passwordHash) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND valid_until > UTC_TIMESTAMP() FOR UPDATE', [tokenHash]);
        if (!rows[0]) { await connection.rollback(); return false; }
        const userId = rows[0].user_id;
        await connection.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
        await connection.query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [userId]);
        await connection.query("DELETE FROM sessions WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) AS UNSIGNED) = ?", [userId]);
        await connection.commit();
        return true;
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    },
  };
}
