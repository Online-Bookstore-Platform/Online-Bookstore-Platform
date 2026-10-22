'use strict';

const { badRequest } = require('../utils/httpError');

const SORT_FIELDS = ['title', 'author', 'price', 'newest'];
const AVAILABILITY_VALUES = ['all', 'in_stock', 'out_of_stock'];
const MAX_SEARCH_LENGTH = 100;
const MAX_SEARCH_TERMS = 8;
const MAX_CATEGORIES = 20;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PRICE = 99999999.99; // DECIMAL(10,2)

/**
 * Validate and normalise the query string of GET /api/books.
 * Throws a 400 HttpError listing every problem found, in plain language.
 *
 * @param {Record<string, unknown>} query  req.query
 */
function parseListBooksQuery(query) {
  const problems = [];
  const fail = (field, message) => problems.push({ field, message });

  // A query-string value may arrive as an array if the parameter is repeated.
  const single = (field) => {
    const value = query[field];
    if (Array.isArray(value)) {
      fail(field, 'Please provide only one value.');
      return undefined;
    }
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    return text === '' ? undefined : text;
  };

  // --- search text -----------------------------------------------------------
  let terms = [];
  const q = single('q');
  if (q !== undefined) {
    if (q.length > MAX_SEARCH_LENGTH) {
      fail('q', `Search text is too long (up to ${MAX_SEARCH_LENGTH} characters).`);
    } else {
      terms = q.split(/\s+/).slice(0, MAX_SEARCH_TERMS);
    }
  }

  // --- category (one id, or several separated by commas) ---------------------
  let categoryIds = [];
  const category = single('category');
  if (category !== undefined) {
    const parts = category.split(',').map((p) => p.trim());
    if (parts.length > MAX_CATEGORIES || !parts.every((p) => /^[1-9]\d{0,9}$/.test(p))) {
      fail('category', 'Please choose a valid category.');
    } else {
      categoryIds = [...new Set(parts.map(Number))];
    }
  }

  // --- author ----------------------------------------------------------------
  const author = single('author');
  if (author !== undefined && author.length > 150) {
    fail('author', 'Author name is too long.');
  }

  // --- price range -----------------------------------------------------------
  const priceFrom = (field, label) => {
    const raw = single(field);
    if (raw === undefined) return undefined;
    const value = /^\d+(\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value > MAX_PRICE) {
      fail(field, `${label} must be a number such as 150 or 149.99.`);
      return undefined;
    }
    return value;
  };
  const minPrice = priceFrom('minPrice', 'Minimum price');
  const maxPrice = priceFrom('maxPrice', 'Maximum price');
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    fail('minPrice', 'Minimum price cannot be higher than the maximum price.');
  }

  // --- availability ----------------------------------------------------------
  const availability = single('availability') ?? 'all';
  if (!AVAILABILITY_VALUES.includes(availability)) {
    fail('availability', 'Availability must be "all", "in_stock" or "out_of_stock".');
  }

  // --- sorting ---------------------------------------------------------------
  const sortField = single('sort') ?? 'title';
  if (!SORT_FIELDS.includes(sortField)) {
    fail('sort', `Sort by one of: ${SORT_FIELDS.join(', ')}.`);
  }
  const defaultOrder = sortField === 'newest' ? 'desc' : 'asc';
  const sortOrder = (single('order') ?? defaultOrder).toLowerCase();
  if (!['asc', 'desc'].includes(sortOrder)) {
    fail('order', 'Order must be "asc" or "desc".');
  }

  // --- pagination ------------------------------------------------------------
  const integer = (field, fallback, { min, max, label }) => {
    const raw = single(field);
    if (raw === undefined) return fallback;
    const value = /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(value) || value < min || value > max) {
      fail(field, `${label} must be a whole number from ${min} to ${max}.`);
      return fallback;
    }
    return value;
  };
  const page = integer('page', 1, { min: 1, max: 100000, label: 'Page' });
  const pageSize = integer('pageSize', DEFAULT_PAGE_SIZE, { min: 1, max: MAX_PAGE_SIZE, label: 'Page size' });

  if (problems.length > 0) {
    throw badRequest('Some of the search options are not valid. Please check them and try again.', problems);
  }

  return {
    filters: { terms, categoryIds, author, minPrice, maxPrice, availability },
    sort: { field: sortField, order: sortOrder },
    page,
    pageSize,
  };
}

module.exports = { parseListBooksQuery, SORT_FIELDS, AVAILABILITY_VALUES, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE };
