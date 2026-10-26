export async function findOrderByIdempotencyKey(db, userId, key, { lock = false } = {}) {
  const [rows] = await db.query(
    `SELECT id FROM orders WHERE user_id = ? AND idempotency_key = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [userId, key]
  );
  return rows[0] ?? null;
}

export async function getSavedDelivery(db, userId) {
  const [rows] = await db.query(
    `SELECT recipient_name AS recipientName, phone, address_line1 AS addressLine1,
            address_line2 AS addressLine2, city, state, postal_code AS postalCode, country
       FROM delivery_details WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function getCartId(db, userId) {
  const [rows] = await db.query('SELECT id FROM carts WHERE user_id = ? FOR UPDATE', [userId]);
  return rows[0]?.id ?? null;
}

export async function getCartItemsForOrder(db, cartId) {
  const [rows] = await db.query(
    `SELECT ci.book_id AS bookId, ci.quantity, b.title, b.price AS unitPrice
       FROM cart_items ci
       JOIN books b ON b.id = ci.book_id
      WHERE ci.cart_id = ?
      ORDER BY ci.book_id
      FOR UPDATE`,
    [cartId]
  );
  return rows;
}

export async function createOrder(db, { orderNumber, userId, totalAmount, delivery, idempotencyKey, paymentMethod = 'card' }) {
  const [result] = await db.query(
    `INSERT INTO orders (
       order_number, user_id, status, total_amount, currency,
       recipient_name, phone, address_line1, address_line2,
       city, state, postal_code, country, idempotency_key, payment_method, payment_status
     ) VALUES (?, ?, 'pending', ?, 'INR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderNumber, userId, totalAmount, delivery.recipientName, delivery.phone,
      delivery.addressLine1, delivery.addressLine2, delivery.city, delivery.state,
      delivery.postalCode, delivery.country, idempotencyKey, paymentMethod,
      paymentMethod === 'cod' ? 'pending_collection' : 'pending',
    ]
  );
  return result.insertId;
}

export async function setCodPaymentDue(db, orderId, userId) {
  await db.query("UPDATE orders SET status = 'pending_collection' WHERE id = ?", [orderId]);
  await db.query(`INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note)
    VALUES (?, NULL, 'pending_collection', ?, 'Cash on delivery selected; payment is due on delivery.')`, [orderId, userId]);
}

export async function createOrderItem(db, orderId, item) {
  await db.query(
    `INSERT INTO order_items (order_id, book_id, book_title, quantity, unit_price)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, item.bookId, item.title, item.quantity, item.unitPrice]
  );
}

export async function createInitialStatus(db, orderId, userId) {
  await db.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note)
     VALUES (?, NULL, 'pending', ?, 'Order created and awaiting payment.')`,
    [orderId, userId]
  );
}

export async function clearCart(db, cartId) {
  await db.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
}

export async function listOrders(db, userId) {
  const [rows] = await db.query(
    `SELECT id, order_number AS orderNumber, status, payment_method AS paymentMethod, payment_status AS paymentStatus, total_amount AS totalAmount,
            currency, created_at AS createdAt,
            COALESCE((SELECT p.status FROM payments p WHERE p.order_id = orders.id ORDER BY p.id DESC LIMIT 1), payment_status) AS paymentStatus
       FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows;
}

export async function findOrder(db, userId, orderId) {
  const [rows] = await db.query(
    `SELECT id, order_number AS orderNumber, status, payment_method AS paymentMethod, payment_status AS paymentStatus, total_amount AS totalAmount,
            currency, recipient_name AS recipientName, phone,
            address_line1 AS addressLine1, address_line2 AS addressLine2,
            city, state, postal_code AS postalCode, country, created_at AS createdAt
       FROM orders WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, orderId]
  );
  return rows[0] ?? null;
}

export async function listOrderItems(db, orderId) {
  const [rows] = await db.query(
    `SELECT book_id AS bookId, book_title AS title, quantity, unit_price AS unitPrice,
            (SELECT b.cover_image_url FROM books b WHERE b.id = order_items.book_id) AS coverImageUrl
       FROM order_items WHERE order_id = ? ORDER BY id`,
    [orderId]
  );
  return rows;
}

export async function listStatusHistory(db, orderId) {
  const [rows] = await db.query(
    `SELECT from_status AS fromStatus, to_status AS toStatus, note,
            created_at AS createdAt
       FROM order_status_history WHERE order_id = ? ORDER BY id`,
    [orderId]
  );
  return rows;
}

export async function listPaymentAttempts(db, orderId) {
  const [rows] = await db.query(
    `SELECT status, amount, currency, created_at AS createdAt
       FROM payments WHERE order_id = ? ORDER BY id`,
    [orderId]
  );
  return rows;
}

export async function findOrderForUpdate(db, userId, orderId) {
  const [rows] = await db.query(
    'SELECT id, status FROM orders WHERE user_id = ? AND id = ? FOR UPDATE',
    [userId, orderId]
  );
  return rows[0] ?? null;
}

export async function getPayableOrder(db, orderId, customerId) {
  const [rows] = await db.query(
    `SELECT id, user_id AS customerId, total_amount AS amount, currency, status
       FROM orders
      WHERE id = ? AND user_id = ? AND status IN ('pending', 'payment_failed')
      LIMIT 1`,
    [orderId, customerId]
  );
  return rows[0] ?? null;
}

export async function listOrderStockItems(db, orderId) {
  const [rows] = await db.query(
    'SELECT book_id AS bookId, quantity FROM order_items WHERE order_id = ? ORDER BY book_id',
    [orderId]
  );
  return rows;
}

export async function changeOrderStatus(db, orderId, currentStatus, nextStatus) {
  const [result] = await db.query(
    'UPDATE orders SET status = ?, payment_status = ? WHERE id = ? AND status = ?',
    [nextStatus, nextStatus === 'paid' ? 'succeeded' : 'failed', orderId, currentStatus]
  );
  return result.affectedRows === 1;
}

export async function addStatusHistory(db, { orderId, fromStatus, toStatus, note }) {
  await db.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note)
     VALUES (?, ?, ?, NULL, ?)`,
    [orderId, fromStatus, toStatus, note]
  );
}
