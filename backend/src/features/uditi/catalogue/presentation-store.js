import { createHash } from 'node:crypto';

const norm = value => typeof value === 'string' ? value.trim() : '';
export function presentationStoreEnabled(env = process.env) { return String(env.CATALOGUE_DEMO_MODE || '').toLowerCase() === 'true'; }
export function assertPresentationStoreEnvironment(env = process.env) {
  if (presentationStoreEnabled(env) && String(env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('CATALOGUE_DEMO_MODE cannot be enabled when NODE_ENV=production.');
  }
}
export function generatedPresentationPrice(key, env = process.env) {
  const min = Number(env.CATALOGUE_DEMO_PRICE_MIN ?? 199);
  const max = Number(env.CATALOGUE_DEMO_PRICE_MAX ?? 999);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) throw new Error('CATALOGUE_DEMO_PRICE_MIN/MAX must be positive INR amounts, with max >= min.');
  const low = Math.ceil(min * 100); const high = Math.floor(max * 100);
  const hash = createHash('sha256').update(key).digest();
  return (low + hash.readUInt32BE(0) % (high - low + 1)) / 100;
}

const transientTransactionError = error => error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213
  || error?.code === 'ER_LOCK_WAIT_TIMEOUT' || error?.errno === 1205;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function categoryId(db, category) {
  const name = (norm(category) || 'Books').slice(0, 80);
  await db.query('INSERT IGNORE INTO categories (name) VALUES (?)', [name]);
  const [[row]] = await db.query('SELECT id FROM categories WHERE name = ?', [name]);
  return row.id;
}

/** Resolve provider identity to a durable local product; concurrent calls serialize on unique mapping. */
export async function resolvePresentationProduct(pool, book, env = process.env) {
  if (!presentationStoreEnabled(env) || !pool) return null;
  const provider = book?.provider;
  const providerId = norm(book?.providerId || (provider === 'openlibrary' ? book?.identifiers?.openLibraryWorkId : ''));
  if (!['openlibrary', 'googlebooks'].includes(provider) || !providerId || providerId.length > 120) return null;
  if (provider === 'openlibrary' && !/^works\/OL\d+W$/.test(providerId)) return null;
  if (provider === 'googlebooks' && !/^[\w-]+$/.test(providerId)) return null;
  const title = norm(book.title); const author = norm(book.author || book.authors?.join(', ')) || 'Author unavailable';
  if (!title || title === 'Untitled') return null;
  const mappingKey = `${provider}:${providerId}`;
  const price = generatedPresentationPrice(mappingKey, env);
  const stock = Number(env.CATALOGUE_DEMO_INITIAL_STOCK ?? 10);
  if (!Number.isSafeInteger(stock) || stock < 1) throw new Error('CATALOGUE_DEMO_INITIAL_STOCK must be a positive integer.');
  const db = await pool.getConnection();
  // Provider IDs can differ while sharing an ISBN/category unique key. Use one
  // short-lived advisory lock so every resolver takes those secondary locks in
  // the same order. Acquire it before beginning the transaction: GET_LOCK waits
  // must never hold row locks or an open transaction.
  const lockName = 'folio:presentation-product-resolution';
  let acquired = false;
  try {
    const [[lock]] = await db.query('SELECT GET_LOCK(?, 15) AS acquired', [lockName]);
    acquired = Number(lock.acquired) === 1;
    if (!acquired) throw new Error('Timed out resolving a presentation product. Retry the catalogue request.');
    for (let attempt = 0; ; attempt += 1) {
      try {
        await db.beginTransaction();
        const [[mapped]] = await db.query('SELECT book_id FROM presentation_products WHERE provider = ? AND provider_id = ? FOR UPDATE', [provider, providerId]);
        if (mapped) {
          await db.commit();
          return Number(mapped.book_id);
        }
        const validIsbns = Array.isArray(book.isbns) ? book.isbns : [];
        let productId = null;
        for (const isbnRaw of validIsbns) {
          const isbn = String(isbnRaw).replace(/[^\dX]/gi, '').toUpperCase();
          if (!/^\d{9}[\dX]$/.test(isbn) && !/^\d{13}$/.test(isbn)) continue;
          const [[existing]] = await db.query('SELECT id FROM books WHERE isbn = ? LIMIT 1 FOR UPDATE', [isbn]);
          if (existing) { productId = Number(existing.id); break; }
        }
        if (!productId && provider === 'openlibrary') {
          const [[existing]] = await db.query('SELECT id FROM books WHERE open_library_work_id = ? LIMIT 1 FOR UPDATE', [providerId]);
          if (existing) productId = Number(existing.id);
        }
        if (!productId) {
          const category = await categoryId(db, book.category);
          const isbn = validIsbns.map(value => String(value).replace(/[^\dX]/gi, '').toUpperCase()).find(value => /^\d{9}[\dX]$/.test(value) || /^\d{13}$/.test(value)) || null;
          const [insert] = await db.query(
            `INSERT INTO books (isbn, title, author, category_id, price, description, cover_image_url)
             VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
            [isbn, title.slice(0, 255), author.slice(0, 150), category, price, norm(book.description) || null, book.coverImageUrl || null]
          );
          productId = Number(insert.insertId);
          await db.query('INSERT IGNORE INTO inventory (book_id, quantity) VALUES (?, ?)', [productId, stock]);
        }
        await db.query('INSERT INTO presentation_products (provider, provider_id, book_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE book_id = VALUES(book_id)', [provider, providerId, productId]);
        await db.commit();
        return productId;
      } catch (error) {
        await db.rollback().catch(() => {});
        if (!transientTransactionError(error) || attempt >= 2) throw error;
        // Roll back the whole unit before retrying; never retry arbitrary SQL
        // failures or continue with a partially applied transaction.
        await pause(25 * (attempt + 1));
      }
    }
  } finally {
    try { if (acquired) await db.query('SELECT RELEASE_LOCK(?)', [lockName]); }
    finally { db.release(); }
  }
}
