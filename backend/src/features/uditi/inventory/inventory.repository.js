import { escapeLike, isbnPrefixFromTerm } from '../shared/search.js';
import { LOW_STOCK_THRESHOLD, stockStatus } from './stock.js';

/*
 * Plain SQL for the inventory table. The rules that decide WHEN these are used
 * (validation, locking order, audit trail) live in inventory.service.js.
 * Every function takes the executor first, so it works on the pool or on a
 * connection that is inside a transaction.
 */

const STOCK_FROM = 'FROM books b JOIN inventory i ON i.book_id = b.id';
const STOCK_COLUMNS = 'b.id AS book_id, b.title, b.author, b.isbn, b.is_active, i.quantity, i.updated_at';

function toStock(row) {
  return {
    bookId: row.book_id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    quantity: row.quantity,
    stockStatus: stockStatus(row.quantity),
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
  };
}

/** Administrator view: every book (also removed ones) with its exact quantity, lowest stock first. */
export async function listStock(db, { terms, status, page, pageSize }) {
  const where = [];
  const args = [];

  for (const term of terms) {
    const like = `%${escapeLike(term)}%`;
    const alternatives = ['b.title LIKE ?', 'b.author LIKE ?'];
    args.push(like, like);
    const isbnPrefix = isbnPrefixFromTerm(term);
    if (isbnPrefix) {
      alternatives.push('b.isbn LIKE ?');
      args.push(`${escapeLike(isbnPrefix)}%`);
    }
    where.push(`(${alternatives.join(' OR ')})`);
  }
  if (status === 'out') where.push('i.quantity = 0');
  if (status === 'low') {
    where.push('i.quantity BETWEEN 1 AND ?');
    args.push(LOW_STOCK_THRESHOLD);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${STOCK_FROM} ${whereSql}`, args);
  const [rows] = await db.query(
    `SELECT ${STOCK_COLUMNS} ${STOCK_FROM} ${whereSql}
      ORDER BY i.quantity ASC, b.title ASC, b.id ASC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  return { items: rows.map(toStock), totalItems: total, totalPages: Math.ceil(total / pageSize) };
}

export async function getStock(db, bookId) {
  const [rows] = await db.query(`SELECT ${STOCK_COLUMNS} ${STOCK_FROM} WHERE b.id = ?`, [bookId]);
  return rows.length > 0 ? toStock(rows[0]) : null;
}

/**
 * Quantity and active flag for several books. Books that do not exist are simply
 * missing from the result. With `lock`, reads the latest committed values and holds
 * a shared lock until the transaction ends.
 */
export async function findAvailability(db, bookIds, { lock = false } = {}) {
  const [rows] = await db.query(
    `SELECT b.id, b.title, b.is_active, COALESCE(i.quantity, 0) AS quantity
       FROM books b LEFT JOIN inventory i ON i.book_id = b.id
      WHERE b.id IN (?) ${lock ? 'FOR SHARE OF b, i' : ''}`,
    [bookIds]
  );
  return rows;
}

/**
 * Remove `quantity` copies only if the book is still on sale and that many are on hand.
 * One atomic statement, so two buyers can never both get the last copy. Returns true on success.
 */
export async function decrementIfEnough(connection, bookId, quantity) {
  const [result] = await connection.query(
    `UPDATE inventory i JOIN books b ON b.id = i.book_id
        SET i.quantity = i.quantity - ?
      WHERE i.book_id = ? AND i.quantity >= ? AND b.is_active = TRUE`,
    [quantity, bookId, quantity]
  );
  return result.affectedRows === 1;
}

/** Put `quantity` copies back. Returns false if the book has no inventory row. */
export async function increment(connection, bookId, quantity) {
  const [result] = await connection.query('UPDATE inventory SET quantity = quantity + ? WHERE book_id = ?', [quantity, bookId]);
  return result.affectedRows === 1;
}

/** Lock the book's inventory row for the rest of the transaction; null if there is none. */
export async function lockQuantity(connection, bookId) {
  const [rows] = await connection.query('SELECT quantity FROM inventory WHERE book_id = ? FOR UPDATE', [bookId]);
  return rows.length > 0 ? rows[0].quantity : null;
}

export async function writeQuantity(connection, bookId, quantity) {
  await connection.query('UPDATE inventory SET quantity = ? WHERE book_id = ?', [quantity, bookId]);
}

export async function recordAdjustment(connection, { bookId, adminId, before, after, reason }) {
  await connection.query(
    `INSERT INTO inventory_adjustments (book_id, admin_id, quantity_before, quantity_after, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [bookId, adminId, before, after, reason ?? null]
  );
}
