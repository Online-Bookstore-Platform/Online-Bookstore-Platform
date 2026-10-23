/*
 * Read/write access for checkout. The cart belongs to the cart feature (Vrinda) and is
 * read through a cart reader (cart.reader.js), not from here. Delivery details belong
 * to checkout.
 */

/** Current catalogue data for the given books (any that do not exist are simply missing). */
export async function findBooksByIds(db, bookIds) {
  if (bookIds.length === 0) return [];
  const [rows] = await db.query(
    `SELECT b.id, b.title, b.author, b.isbn, b.price, b.cover_image_url, b.is_active,
            c.id AS category_id, c.name AS category_name
       FROM books b JOIN categories c ON c.id = b.category_id
      WHERE b.id IN (?)`,
    [bookIds]
  );
  return rows;
}

function toDelivery(row) {
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

export async function findDelivery(db, userId) {
  const [rows] = await db.query('SELECT * FROM delivery_details WHERE user_id = ?', [userId]);
  return rows.length > 0 ? toDelivery(rows[0]) : null;
}

/** Create or replace the saved delivery details of a user. */
export async function saveDelivery(db, userId, d) {
  await db.query(
    `INSERT INTO delivery_details
       (user_id, recipient_name, phone, address_line1, address_line2, city, state, postal_code, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       recipient_name = VALUES(recipient_name), phone = VALUES(phone),
       address_line1 = VALUES(address_line1), address_line2 = VALUES(address_line2),
       city = VALUES(city), state = VALUES(state), postal_code = VALUES(postal_code), country = VALUES(country)`,
    [userId, d.recipientName, d.phone, d.addressLine1, d.addressLine2, d.city, d.state, d.postalCode, d.country]
  );
}

/** Name and phone from the account, used to pre-fill the form. */
export async function findAccountContact(db, userId) {
  const [rows] = await db.query('SELECT name, phone FROM users WHERE id = ?', [userId]);
  return rows.length > 0 ? { recipientName: rows[0].name, phone: rows[0].phone ?? '' } : null;
}
