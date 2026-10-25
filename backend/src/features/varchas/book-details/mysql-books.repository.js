import { withTransaction } from '../../uditi/shared/transaction.js';

const SELECT_BOOK = `SELECT b.id, b.title, b.author, b.isbn, b.open_library_work_id AS openLibraryWorkId, c.name AS category,
  b.description, b.price, b.cover_image_url AS coverImageUrl, b.is_active AS isActive
  FROM books b JOIN categories c ON c.id = b.category_id`;

function toBook(row) {
  return row ? { ...row, currency: 'INR', isActive: Boolean(row.isActive) } : null;
}

async function categoryId(connection, category) {
  const [rows] = await connection.query('SELECT id FROM categories WHERE name = ? LIMIT 1', [category]);
  if (rows[0]) return rows[0].id;
  try {
    const [result] = await connection.query('INSERT INTO categories (name) VALUES (?)', [category]);
    return result.insertId;
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    const [retry] = await connection.query('SELECT id FROM categories WHERE name = ? LIMIT 1', [category]);
    if (!retry[0]) throw error;
    return retry[0].id;
  }
}

export function createMySqlBooksRepository(pool) {
  return {
    async findById(id) {
      const [rows] = await pool.query(`${SELECT_BOOK} WHERE b.id = ? AND b.is_active = 1 LIMIT 1`, [id]);
      return toBook(rows[0]);
    },
    async list() {
      const [rows] = await pool.query(`${SELECT_BOOK} ORDER BY b.is_active DESC, b.title, b.id`);
      return rows.map(toBook);
    },
    async create(book) {
      return withTransaction(pool, async connection => {
        const category = await categoryId(connection, book.category);
        const [result] = await connection.query(
          `INSERT INTO books (isbn, open_library_work_id, title, author, category_id, price, description, cover_image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [book.isbn || null, book.openLibraryWorkId || null, book.title, book.author, category, book.price, book.description, book.coverImageUrl || null]
        );
        await connection.query('INSERT INTO inventory (book_id, quantity) VALUES (?, 0)', [result.insertId]);
        const [rows] = await connection.query(`${SELECT_BOOK} WHERE b.id = ?`, [result.insertId]);
        return toBook(rows[0]);
      });
    },
    async update(id, patch) {
      return withTransaction(pool, async connection => {
        const [existing] = await connection.query('SELECT id FROM books WHERE id = ? FOR UPDATE', [id]);
        if (!existing[0]) return null;
        const columns = { title: 'title', author: 'author', isbn: 'isbn', openLibraryWorkId: 'open_library_work_id', description: 'description', price: 'price', coverImageUrl: 'cover_image_url' };
        const assignments = [];
        const values = [];
        for (const [field, column] of Object.entries(columns)) {
          if (Object.hasOwn(patch, field)) {
            assignments.push(`${column} = ?`);
            values.push((field === 'coverImageUrl' || field === 'isbn' || field === 'openLibraryWorkId') && patch[field] === '' ? null : patch[field]);
          }
        }
        if (Object.hasOwn(patch, 'category')) {
          assignments.push('category_id = ?');
          values.push(await categoryId(connection, patch.category));
        }
        if (assignments.length) await connection.query(`UPDATE books SET ${assignments.join(', ')} WHERE id = ?`, [...values, id]);
        const [rows] = await connection.query(`${SELECT_BOOK} WHERE b.id = ?`, [id]);
        return toBook(rows[0]);
      });
    },
    async deleteOrDeactivate(id) {
      const [result] = await pool.query('UPDATE books SET is_active = 0 WHERE id = ? AND is_active = 1', [id]);
      return result.affectedRows > 0;
    },
  };
}
