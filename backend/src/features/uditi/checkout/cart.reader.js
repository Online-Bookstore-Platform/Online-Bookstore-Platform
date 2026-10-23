/**
 * CART CONTRACT (what checkout needs from the cart feature, owned by Vrinda)
 *
 *   cartReader.getItems(userId) -> Promise<Array<{ bookId, quantity }>>
 *
 * It returns the signed-in user's current cart lines (an empty array for an empty cart).
 * Checkout never changes the cart and never trusts a price from it: prices and stock are
 * read again from the database every time.
 *
 * Until the cart service exists, createDatabaseCartReader reads the shared tables
 * `carts` / `cart_items` directly (read-only). The integration owner can pass the real
 * cart service instead when Vrinda's feature is connected.
 */

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export function createDatabaseCartReader(pool) {
  return {
    async getItems(userId) {
      const [rows] = await pool.query(
        `SELECT ci.book_id AS bookId, ci.quantity
           FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
          WHERE c.user_id = ?
          ORDER BY ci.added_at, ci.book_id`,
        [userId]
      );
      return rows;
    },
  };
}
