'use strict';

const { stockStatus } = require('../utils/stock');

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

/** Escape LIKE wildcards so "100%" or "a_b" are searched literally. */
function escapeLike(text) {
  return text.replace(/[\\%_]/g, '\\$&');
}

/** "978-1-001-12648-7" -> "9781001126487"; null if the term cannot be (part of) an ISBN. */
function isbnPrefixFromTerm(term) {
  if (!/^[0-9Xx-]+$/.test(term)) return null;
  const digits = term.replace(/-/g, '').toUpperCase();
  return digits.length >= 4 && digits.length <= 13 ? digits : null;
}

function toBookDto(row) {
  return {
    id: row.id,
    isbn: row.isbn,
    title: row.title,
    author: row.author,
    category: { id: row.category_id, name: row.category_name },
    price: row.price,
    coverImageUrl: row.cover_image_url,
    stockStatus: stockStatus(row.quantity),
    inStock: row.quantity > 0,
  };
}

/**
 * Search / filter / sort / paginate the active catalogue.
 * Every search term must match the title, author, category name or (the start
 * of) the ISBN - so "austen pride" finds "Pride and Prejudice" by Jane Austen.
 *
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {{ filters: object, sort: {field: string, order: string}, page: number, pageSize: number }} params
 */
async function searchBooks(db, { filters, sort, page, pageSize }) {
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
  const [rows] = await db.query(
    `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );

  return {
    items: rows.map((row) => toBookDto(row)),
    totalItems: total,
    totalPages: Math.ceil(total / pageSize),
  };
}

const MAX_AUTHORS_LISTED = 200;

/** Values for the filter controls: categories with counts, authors, price range. */
async function getFilterOptions(db) {
  const [categories] = await db.query(
    `SELECT c.id, c.name, COUNT(b.id) AS bookCount
       FROM categories c
       JOIN books b ON b.category_id = c.id AND b.is_active = 1
      GROUP BY c.id, c.name
      ORDER BY c.name`
  );
  const [authorRows] = await db.query(
    'SELECT DISTINCT author FROM books WHERE is_active = 1 ORDER BY author LIMIT ?',
    [MAX_AUTHORS_LISTED + 1]
  );
  const [[range]] = await db.query(
    'SELECT MIN(price) AS minPrice, MAX(price) AS maxPrice FROM books WHERE is_active = 1'
  );

  return {
    categories,
    authors: authorRows.slice(0, MAX_AUTHORS_LISTED).map((r) => r.author),
    authorsTruncated: authorRows.length > MAX_AUTHORS_LISTED,
    priceRange: { min: range.minPrice ?? 0, max: range.maxPrice ?? 0 },
  };
}

module.exports = { searchBooks, getFilterOptions, escapeLike, isbnPrefixFromTerm };
