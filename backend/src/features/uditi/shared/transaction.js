/**
 * Run `work(connection)` inside one database transaction: commit if it returns,
 * roll back if it throws. Use it for anything that must change several rows together,
 * e.g. creating an order and deducting its stock.
 *
 * @template T
 * @param {import('mysql2/promise').Pool} pool
 * @param {(connection: import('mysql2/promise').PoolConnection) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransaction(pool, work) {
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
      /* the original error is the useful one */
    }
    throw error;
  } finally {
    connection.release();
  }
}
