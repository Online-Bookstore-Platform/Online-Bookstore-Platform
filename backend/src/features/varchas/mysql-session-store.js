import session from 'express-session';

const nowInSeconds = () => Math.floor(Date.now() / 1000);

function expirationTime(sessionData) {
  const expires = sessionData?.cookie?.expires;
  if (expires) {
    const timestamp = Math.floor(new Date(expires).getTime() / 1000);
    if (Number.isFinite(timestamp)) return timestamp;
  }

  const maxAge = sessionData?.cookie?.maxAge;
  return Number.isFinite(maxAge) ? Math.floor((Date.now() + maxAge) / 1000) : 0;
}

/** Express-session Store backed by the shared MySQL pool and schema.sql sessions table. */
export class MySqlSessionStore extends session.Store {
  constructor(pool) {
    super();
    if (!pool || typeof pool.query !== 'function') throw new TypeError('MySqlSessionStore requires a MySQL-compatible pool.');
    this.pool = pool;
  }

  get(sessionId, callback) {
    this.pool.query('SELECT data, expires FROM sessions WHERE session_id = ? LIMIT 1', [sessionId])
      .then(async ([rows]) => {
        const row = rows[0];
        if (!row) return callback(null, null);
        if (Number(row.expires) <= nowInSeconds()) {
          this.destroy(sessionId, error => callback(error, null));
          return;
        }
        callback(null, JSON.parse(row.data));
      })
      .catch(callback);
  }

  set(sessionId, sessionData, callback) {
    const expires = expirationTime(sessionData);
    const data = JSON.stringify(sessionData);
    this.pool.query(
      `INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
      [sessionId, expires, data]
    ).then(() => callback?.(null), error => callback?.(error));
  }

  touch(sessionId, sessionData, callback) {
    this.pool.query(
      'UPDATE sessions SET expires = ? WHERE session_id = ?',
      [expirationTime(sessionData), sessionId]
    ).then(() => callback?.(null), error => callback?.(error));
  }

  destroy(sessionId, callback) {
    this.pool.query('DELETE FROM sessions WHERE session_id = ?', [sessionId])
      .then(() => callback?.(null), error => callback?.(error));
  }
}

export function createMySqlSessionStore(pool) {
  return new MySqlSessionStore(pool);
}
