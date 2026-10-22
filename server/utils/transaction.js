'use strict';

/**
 * Run `work(connection)` inside a database transaction.
 * Commits when it resolves, rolls back (and rethrows) when it throws, and always
 * returns the connection to the pool.
 *
 * @template T
 * @param {import('mysql2/promise').Pool} pool
 * @param {(connection: import('mysql2/promise').PoolConnection) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withTransaction(pool, work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* the original error is the one worth reporting */
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { withTransaction };
