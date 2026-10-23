import { escapeLike, isbnPrefixFromTerm } from '../shared/search.js';
import { stockStatus } from '../inventory/stock.js';

// Whitelist: user input only ever picks a KEY here, never becomes SQL text.
const SORT_COLUMNS = {
  title: 'b.title',
  author: 'b.author',
  price: 'b.price',
  newest: 'b.id', // ids grow with insertion order
};

const FROM_CLAUSE = `
  FROM books b
  JOIN categories c ON c.id = b.category_id
  LEFT JOIN inventory i ON i.book_id = b.id`;

const SELECT_COLUMNS = `
  b.id, b.isbn, b.title, b.author, b.price, b.cover_image_url,
  c.id AS category_id, c.name AS category_name,
  COALESCE(i.quantity, 0) AS quantity`;

/**
 * Book as the catalogue shows it. Field names follow the book-details feature
 * (category as text, price, currency, coverImageUrl) so cards and the details page agree.
 * Customers see an availability label, never the exact quantity.
 */
export function toCatalogueBook(row) {
  const status = stockStatus(row.quantity);
  return {
    id: row.id,
    isbn: row.isbn,
    title: row.title,
    author: row.author,
    category: row.category_name,
    categoryId: row.category_id,
    price: row.price,
    currency: 'INR',
    coverImageUrl: row.cover_image_url,
    stockStatus: status,
    available: status !== 'out_of_stock',
  };
}

/**
 * Search / filter / sort / paginate the active catalogue, entirely in SQL.
 * Every search term must match the title, author, category name or (the start of)
 * the ISBN - so "austen pride" finds "Pride and Prejudice" by Jane Austen.
 *
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {{ filters: object, sort: {field: string, order: string}, page: number, pageSize: number }} params
 */
export async function searchBooks(db, { filters, sort, page, pageSize }) {
  const where = ['b.is_active = 1'];
  const args = [];

  for (const term of filters.terms) {
    const like = `%${escapeLike(term)}%`;
    const alternatives = ['b.title LIKE ?', 'b.author LIKE ?', 'c.name LIKE ?'];
    args.push(like, like, like);

    const isbnPrefix = isbnPrefixFromTerm(term);
    if (isbnPrefix) {
      alternatives.push('b.isbn LIKE ?');
      args.push(`${escapeLike(isbnPrefix)}%`);
    }
    where.push(`(${alternatives.join(' OR ')})`);
  }

  if (filters.categoryIds.length > 0) {
    where.push('b.category_id IN (?)');
    args.push(filters.categoryIds);
  }
  if (filters.author !== undefined) {
    where.push('b.author = ?');
    args.push(filters.author);
  }
  if (filters.minPrice !== undefined) {
    where.push('b.price >= ?');
    args.push(filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    where.push('b.price <= ?');
    args.push(filters.maxPrice);
  }
  if (filters.availability === 'in_stock') where.push('COALESCE(i.quantity, 0) > 0');
  if (filters.availability === 'out_of_stock') where.push('COALESCE(i.quantity, 0) = 0');

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const direction = sort.order === 'desc' ? 'DESC' : 'ASC';
  // b.id as the final tie-breaker keeps pages stable when many rows share a value
  const orderSql = `ORDER BY ${SORT_COLUMNS[sort.field]} ${direction}, b.id ASC`;

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${FROM_CLAUSE} ${whereSql}`, args);
  const [rows] = await db.query(`SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]);

  return { books: rows.map(toCatalogueBook), totalItems: total, totalPages: Math.ceil(total / pageSize) };
}

const MAX_AUTHORS_LISTED = 200;

/** Values for the filter controls: categories with counts, authors, price range. */
export async function getFilterOptions(db) {
  const [categories] = await db.query(
    `SELECT c.id, c.name, COUNT(b.id) AS bookCount
       FROM categories c
       JOIN books b ON b.category_id = c.id AND b.is_active = 1
      GROUP BY c.id, c.name
      ORDER BY c.name`
  );
  const [authorRows] = await db.query('SELECT DISTINCT author FROM books WHERE is_active = 1 ORDER BY author LIMIT ?', [MAX_AUTHORS_LISTED + 1]);
  const [[range]] = await db.query('SELECT MIN(price) AS minPrice, MAX(price) AS maxPrice FROM books WHERE is_active = 1');

  return {
    categories,
    authors: authorRows.slice(0, MAX_AUTHORS_LISTED).map(row => row.author),
    authorsTruncated: authorRows.length > MAX_AUTHORS_LISTED,
    priceRange: { min: range.minPrice ?? 0, max: range.maxPrice ?? 0 },
  };
}
