'use strict';

/*
 * Read/write access for checkout. The cart belongs to the cart module (issue #6);
 * checkout only reads it. Delivery details are owned by checkout.
 */

async function findCartId(db, customerId) {
  const [rows] = await db.query('SELECT id FROM carts WHERE customer_id = ?', [customerId]);
  return rows.length > 0 ? rows[0].id : null;
}

/** Cart lines with the book's CURRENT price, oldest line first. */
async function findCartLines(db, cartId) {
  const [rows] = await db.query(
    `SELECT ci.book_id, ci.quantity, b.title, b.author, b.isbn, b.price, b.cover_image_url, b.is_active
       FROM cart_items ci JOIN books b ON b.id = ci.book_id
      WHERE ci.cart_id = ?
      ORDER BY ci.added_at, ci.book_id`,
    [cartId]
  );
  return rows;
}

function toDeliveryDto(row) {
  return {
    recipientName: row.recipient_name,
    phone: row.phone,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
  };
}

async function findDelivery(db, cartId) {
  const [rows] = await db.query('SELECT * FROM delivery_details WHERE cart_id = ?', [cartId]);
  return rows.length > 0 ? toDeliveryDto(rows[0]) : null;
}

/** Create or replace the delivery details of a cart. */
async function saveDelivery(db, cartId, d) {
  await db.query(
    `INSERT INTO delivery_details
       (cart_id, recipient_name, phone, address_line1, address_line2, city, state, postal_code, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       recipient_name = VALUES(recipient_name), phone = VALUES(phone),
       address_line1 = VALUES(address_line1), address_line2 = VALUES(address_line2),
       city = VALUES(city), state = VALUES(state), postal_code = VALUES(postal_code), country = VALUES(country)`,
    [cartId, d.recipientName, d.phone, d.addressLine1, d.addressLine2, d.city, d.state, d.postalCode, d.country]
  );
}

/** Name and phone from the customer's profile, used to pre-fill the form. */
async function findCustomerContact(db, customerId) {
  const [rows] = await db.query('SELECT full_name, phone FROM customers WHERE id = ?', [customerId]);
  return rows.length > 0 ? { recipientName: rows[0].full_name, phone: rows[0].phone ?? '' } : null;
}

module.exports = { findCartId, findCartLines, findDelivery, saveDelivery, findCustomerContact };
