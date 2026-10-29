/**
 * Run `work(connection)` inside one database transaction: commit if it returns,
 * roll back if it throws. Use it for anything that must change several rows together,
 * e.g. creating an order and deducting its stock.
 *
 * @template T
 * @param {import('mysql2/promise').Pool} pool
 * @param {(connection: import('mysql2/promise').PoolConnection) => Promise<T>} work
 * MySQL can pick a transaction as a deadlock victim when several customers buy the same book at
 * the same moment (ER_LOCK_DEADLOCK / ER_LOCK_WAIT_TIMEOUT). The whole transaction has been rolled
 * back by then, so it is safe to run it again; it is retried a few times before the error is passed on.
 *
 * @returns {Promise<T>}
 */
const RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

export async function withTransaction(pool, work, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runOnce(pool, work);
    } catch (error) {
      if (!RETRYABLE.has(error?.code) || attempt >= retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 15 * (attempt + 1) + Math.floor(Math.random() * 25)));
    }
  }
}

async function runOnce(pool, work) {
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
