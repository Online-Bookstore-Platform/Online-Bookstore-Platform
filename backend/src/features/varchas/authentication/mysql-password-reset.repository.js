/** MySQL persistence for hashed, single-use password reset credentials. */
export function createMySqlPasswordResetRepository(pool) {
  return {
    async findResetUserByEmail(email) {
      const [rows] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      return rows[0] ?? null;
    },
    async savePasswordReset(userId, tokenHash, validUntil) {
      const utcDateTime = validUntil.toISOString().slice(0, 19).replace('T', ' ');
      await pool.query('INSERT INTO password_reset_tokens (user_id, token_hash, valid_until) VALUES (?, ?, ?)', [userId, tokenHash, utcDateTime]);
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
