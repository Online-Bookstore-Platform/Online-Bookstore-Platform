export async function findUserByEmail(db, email) {
  const [rows] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] ?? null;
}

export async function createCustomer(db, { name, email, phone, passwordHash }) {
  const [result] = await db.query(
    `INSERT INTO users (name, email, phone, role, password_hash, terms_accepted_at)
     VALUES (?, ?, ?, 'customer', ?, UTC_TIMESTAMP())`,
    [name, email, phone, passwordHash]
  );
  return { id: result.insertId, name, email, phone };
}

export async function getProfile(db, userId) {
  const [rows] = await db.query(
    'SELECT id, name, email, phone, role FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  return rows[0] ?? null;
}

export async function updateProfile(db, userId, changes) {
  const columns = { name: 'name', email: 'email', phone: 'phone' };
  const assignments = Object.keys(changes).map(field => `${columns[field]} = ?`);
  const values = Object.values(changes);
  await db.query(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, [...values, userId]);
  return getProfile(db, userId);
}

