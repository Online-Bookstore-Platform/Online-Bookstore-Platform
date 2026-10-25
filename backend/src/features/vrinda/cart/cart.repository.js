import { lineTotal, sum } from '../../uditi/shared/money.js';
import { stockStatus } from '../../uditi/inventory/stock.js';

export async function getCartId(db, userId, { create = false, lock = false } = {}) {
  if (create) {
    await db.query(
      'INSERT INTO carts (user_id) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
      [userId]
    );
  }
  const [rows] = await db.query(
    `SELECT id FROM carts WHERE user_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [userId]
  );
  return rows[0]?.id ?? null;
}

export async function getCart(db, userId) {
  const [rows] = await db.query(
    `SELECT ci.book_id AS bookId, b.title, b.author, b.isbn,
            b.cover_image_url AS coverImageUrl, b.is_active AS isActive,
            b.price AS unitPrice, ci.quantity, COALESCE(i.quantity, 0) AS availableQuantity
       FROM carts c
       JOIN cart_items ci ON ci.cart_id = c.id
       JOIN books b ON b.id = ci.book_id
       LEFT JOIN inventory i ON i.book_id = b.id
      WHERE c.user_id = ?
      ORDER BY ci.added_at, ci.book_id`,
    [userId]
  );
  const items = rows.map(row => {
    const inStock = Boolean(row.isActive) && row.availableQuantity >= row.quantity;
    const line = {
      itemId: String(row.bookId),
      bookId: row.bookId,
      title: row.title,
      author: row.author,
      isbn: row.isbn,
      coverImageUrl: row.coverImageUrl,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      lineTotal: lineTotal(row.unitPrice, row.quantity),
      available: inStock,
      stockStatus: !row.isActive ? 'out_of_stock' : stockStatus(row.availableQuantity),
      problem: !row.isActive
        ? 'This book is no longer available.'
        : row.availableQuantity < row.quantity
          ? row.availableQuantity === 0
            ? 'This book is out of stock.'
            : `Only ${row.availableQuantity} ${row.availableQuantity === 1 ? 'copy is' : 'copies are'} available.`
          : null,
    };
    return line;
  });
  return {
    items,
    itemCount: items.reduce((count, item) => count + item.quantity, 0),
    totals: { subtotal: sum(items.map(item => item.lineTotal)), currency: 'INR' },
  };
}

export async function findBookAvailability(db, bookId) {
  const [rows] = await db.query(
    `SELECT b.id AS bookId, b.title, b.price, b.is_active AS isActive, COALESCE(i.quantity, 0) AS quantity
       FROM books b LEFT JOIN inventory i ON i.book_id = b.id WHERE b.id = ?`,
    [bookId]
  );
  return rows[0] ?? null;
}

export async function getItemQuantity(db, cartId, bookId, { lock = false } = {}) {
  const [rows] = await db.query(
    `SELECT quantity FROM cart_items WHERE cart_id = ? AND book_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [cartId, bookId]
  );
  return rows[0]?.quantity ?? 0;
}

export async function addItem(db, cartId, bookId, quantity) {
  await db.query(
    `INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
    [cartId, bookId, quantity]
  );
}

export async function setItemQuantity(db, cartId, bookId, quantity) {
  const [result] = await db.query(
    'UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND book_id = ?',
    [quantity, cartId, bookId]
  );
  return result.affectedRows === 1;
}

export async function removeItem(db, cartId, bookId) {
  const [result] = await db.query(
    'DELETE FROM cart_items WHERE cart_id = ? AND book_id = ?',
    [cartId, bookId]
  );
  return result.affectedRows === 1;
}
