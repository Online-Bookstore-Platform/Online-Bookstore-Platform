import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { stockStatus } from '../inventory/stock.js';
import { escapeLike } from '../shared/search.js';
import { presentationStoreEnabled, resolvePresentationProduct } from './presentation-store.js';

const SUBJECTS = ['Fiction', 'Fantasy', 'Science Fiction', 'Mystery', 'Romance', 'History', 'Biography', 'Philosophy', 'Poetry', "Children's Books", 'Computing', 'Science', 'Psychology', 'Business', 'Travel', 'Adventure', 'Classics', 'Anime & Manga'];
const CACHE_MS = 5 * 60_000;
const limiter = rateLimit({ windowMs: 60_000, limit: 45, standardHeaders: true, legacyHeaders: false });
const text = value => typeof value === 'string' ? value.trim() : '';
const array = value => Array.isArray(value) ? value : [];
const secureUrl = value => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') url.protocol = 'https:';
    return url.toString();
  } catch { return null; }
};
const normalizeIsbn = value => String(value || '').replace(/[^\dX]/gi, '').toUpperCase();
export function isValidIsbn(value) {
  const isbn = normalizeIsbn(value);
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((total, character, index) => total + (character === 'X' ? 10 : Number(character)) * (10 - index), 0);
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce((total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }
  return false;
}
const normalizeName = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const CATEGORY_ALIASES = {
  'science fiction': ['science fiction', 'sci fi', 'scifi', 'sf'],
  'children s books': ['children s books', 'childrens books', 'juvenile fiction', 'juvenile literature', 'children'],
  'anime manga': ['anime manga', 'manga', 'anime', 'japanese comics', 'graphic novels manga', 'light novels'],
  computing: ['computing', 'computer science', 'computers', 'information technology'],
  science: ['science', 'physics', 'chemistry', 'biology', 'natural sciences'],
  fiction: ['fiction', 'literature'],
};

function categoryMatches(category, label, subjects = []) {
  const wanted = normalizeName(label);
  const aliases = CATEGORY_ALIASES[wanted] || [wanted];
  return [category, ...subjects].some(value => {
    const normalized = normalizeName(value);
    return aliases.some(alias => normalized === alias || normalized.startsWith(`${alias} `) || normalized.endsWith(` ${alias}`));
  });
}

function isAnimeManga(subjects = []) {
  return subjects.some(value => /\b(manga|anime|light novels?|japanese comics)\b/i.test(value));
}

function deduplicate(books) {
  const seen = new Set();
  return books.filter(book => {
    const isbn = book.isbns.map(normalizeIsbn).find(Boolean);
    const key = isbn ? `isbn:${isbn}` : `title:${normalizeName(book.title)}|${normalizeName(book.author)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function localBook(row) {
  if (!row) return null;
  const id = Number(row.id);
  const price = Number(row.price);
  const quantity = Number(row.quantity);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(quantity) || quantity < 0) return null;
  const isbn = row.isbn || null;
  const status = stockStatus(quantity);
  const categoryId = SUBJECTS.findIndex(name => normalizeName(name) === normalizeName(row.category));
  const storeProduct = { id, price, currency: 'INR', stockStatus: status, available: quantity > 0 };
  return {
    id, provider: 'local', providerId: String(id), title: row.title, author: row.author,
    authors: [row.author], category: row.category, categoryId: categoryId < 0 ? 0 : categoryId + 1,
    coverImageUrl: secureUrl(row.cover_image_url), description: row.description || '', firstPublishYear: null,
    publishDates: [], publishers: [], pageCount: null, isbn, isbns: isValidIsbn(isbn) ? [normalizeIsbn(isbn)] : [],
    subjects: row.category ? [row.category] : [], identifiers: { localBookId: id, ...(row.open_library_work_id ? { openLibraryWorkId: String(row.open_library_work_id).split('/').at(-1) } : {}) },
    sourceUrl: row.open_library_work_id ? `https://openlibrary.org/${encodeURIComponent(row.open_library_work_id)}` : null, previewUrl: null, reading: null,
    price, currency: 'INR', stockStatus: status, available: storeProduct.available, storeProduct,
  };
}

function openLibraryBook(doc, work, reading) {
  const key = text(doc.key || work.key).replace(/^\//, '');
  const subjects = array(work.subjects || doc.subject).filter(value => typeof value === 'string').slice(0, 20);
  const isManga = isAnimeManga(subjects);
  const sourceIsbns = [...new Set(array(doc.isbn).map(normalizeIsbn).filter(Boolean))].slice(0, 10);
  const isbns = sourceIsbns.filter(isValidIsbn);
  const book = {
    id: key,
    provider: 'openlibrary',
    providerId: key,
    title: text(work.title || doc.title) || 'Untitled',
    subtitle: text(work.subtitle || doc.subtitle) || null,
    author: array(doc.author_name).filter(Boolean).join(', ') || 'Author unavailable',
    authors: array(doc.author_name).filter(Boolean),
    category: isManga ? 'Anime & Manga' : subjects[0] || 'Books',
    categoryId: isManga ? 18 : 0,
    coverImageUrl: doc.cover_i ? secureUrl(`https://covers.openlibrary.org/b/id/${encodeURIComponent(doc.cover_i)}-M.jpg?default=false`) : null,
    description: typeof work.description === 'string' ? work.description : text(work.description?.value),
    firstPublishYear: Number(doc.first_publish_year) || null,
    publishDates: array(doc.publish_date).slice(0, 5),
    publishers: array(doc.publisher).slice(0, 5),
    pageCount: Number(doc.number_of_pages_median) || null,
    languages: array(work.languages).map(language => text(language.key || language).split('/').at(-1)).filter(Boolean),
    isbn: isbns[0] || null,
    isbns,
    subjects,
    identifiers: { openLibraryWorkId: key.split('/').at(-1), isbn: isbns },
    sourceUrl: key ? `https://openlibrary.org/${key}` : null,
    previewUrl: null,
    reading: reading || null,
  };
  Object.defineProperty(book, '_providerIsbns', { value: sourceIsbns });
  return book;
}

function googleBook(volume, { large = false } = {}) {
  const info = volume.volumeInfo || {};
  const identifiers = array(info.industryIdentifiers);
  const sourceIsbns = [...new Set(identifiers.map(item => normalizeIsbn(item.identifier)).filter(Boolean))];
  const isbns = sourceIsbns.filter(isValidIsbn);
  const subjects = array(info.categories).filter(value => typeof value === 'string').slice(0, 20);
  const isManga = isAnimeManga(subjects);
  const images = info.imageLinks || {};
  const coverImageUrl = secureUrl(large
    ? images.extraLarge || images.large || images.medium || images.thumbnail || images.smallThumbnail
    : images.thumbnail || images.smallThumbnail || images.small || images.medium || images.large || images.extraLarge);
  const preview = secureUrl(info.previewLink);
  const book = {
    id: `volumes/${volume.id}`,
    provider: 'googlebooks',
    providerId: String(volume.id),
    title: text(info.title) || 'Untitled',
    subtitle: text(info.subtitle) || null,
    author: array(info.authors).filter(Boolean).join(', ') || 'Author unavailable',
    authors: array(info.authors).filter(Boolean),
    category: isManga ? 'Anime & Manga' : subjects[0] || 'Books',
    categoryId: isManga ? 18 : 0,
    coverImageUrl,
    description: text(info.description),
    firstPublishYear: Number.parseInt(text(info.publishedDate).slice(0, 4), 10) || null,
    publicationDate: text(info.publishedDate) || null,
    publishDates: info.publishedDate ? [info.publishedDate] : [],
    publishers: array(info.publisher ? [info.publisher] : []),
    pageCount: Number(info.pageCount) || null,
    languages: text(info.language) ? [text(info.language)] : [],
    isbn: isbns[0] || null,
    isbns,
    subjects,
    identifiers: { googleBooksVolumeId: String(volume.id), isbn: isbns },
    sourceUrl: secureUrl(info.infoLink) || `https://books.google.com/books?id=${encodeURIComponent(volume.id)}`,
    previewUrl: preview && /(^|\.)books\.google\.com$/i.test(new URL(preview).hostname) ? preview : null,
    reading: null,
  };
  Object.defineProperty(book, '_providerIsbns', { value: sourceIsbns });
  return book;
}

export function openLibraryQuery(q, ids) {
  const category = ids.map(id => SUBJECTS[Number(id) - 1]).filter(Boolean).map(name => {
    if (name === 'Anime & Manga') return '(subject:manga OR subject:anime OR subject:light_novels OR subject:graphic_novels)';
    if (name === "Children's Books") return '(subject:juvenile_fiction OR subject:juvenile_literature OR subject:children)';
    if (name === 'Science Fiction') return '(subject:science_fiction OR subject:science_fiction_and_fantasy)';
    return `subject:${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  });
  return [q || (!category.length ? 'subject:fiction' : ''), category.length ? `(${category.join(' OR ')})` : ''].filter(Boolean).join(' ');
}

export function googleQuery(q, ids) {
  const category = ids.map(id => SUBJECTS[Number(id) - 1]).filter(Boolean).map(name => {
    if (name === 'Anime & Manga') return '(subject:manga OR subject:anime OR subject:"light novels" OR subject:"graphic novels")';
    if (name === 'Science Fiction') return '(subject:"science fiction" OR subject:"fiction / science fiction")';
    if (name === "Children's Books") return '(subject:"juvenile fiction" OR subject:"juvenile literature" OR subject:children)';
    return `subject:${name}`;
  });
  return [q, ...category].filter(Boolean).join(' ') || 'subject:fiction';
}

function publicError(error, { fallbackConfigured }) {
  const status = error.status === 404 ? 404 : 502;
  const messages = {
    GOOGLE_BOOKS_INVALID_KEY: 'Google Books rejected the configured API key. Check GOOGLE_BOOKS_API_KEY and its restrictions in Google Cloud Console.',
    GOOGLE_BOOKS_API_DISABLED: 'Enable the Google Books API for the Google Cloud project associated with GOOGLE_BOOKS_API_KEY.',
    GOOGLE_BOOKS_PERMISSION_DENIED: 'Google Books denied this key. Check its Books API restriction and project permissions.',
    GOOGLE_BOOKS_QUOTA_EXCEEDED: 'Google Books quota is exhausted. Check the project quota in Google Cloud Console.',
    GOOGLE_BOOKS_RATE_LIMITED: 'Google Books is rate limiting requests. Please retry shortly.',
    BOOK_PROVIDER_TIMEOUT: 'Book providers took too long to respond. Please retry shortly.',
    BOOK_PROVIDER_NETWORK_ERROR: 'Book providers could not be reached from the server. Check the server’s outbound network access, then retry.',
  };
  const message = messages[error.code]
    || (!fallbackConfigured && (error.code === 'BOOK_PROVIDER_UNAVAILABLE' || error.code === 'GOOGLE_BOOKS_NOT_CONFIGURED')
      ? 'Open Library is unavailable, and Google Books fallback is not configured. Set GOOGLE_BOOKS_API_KEY to enable fallback discovery.'
      : 'Book providers are temporarily unavailable. Please try again shortly.');
  return { status, body: { error: { code: error.code || 'BOOK_PROVIDER_UNAVAILABLE', message } } };
}

function providerFailure(provider, status, payload, cause) {
  const error = new Error('Book metadata provider request failed.');
  error.status = status;
  const reason = String(payload?.error?.errors?.[0]?.reason || payload?.error?.status || '').toLowerCase();
  if (provider === 'googlebooks') {
    if (status === 400 || status === 401 || /keyinvalid|invalid.?key/.test(reason)) error.code = 'GOOGLE_BOOKS_INVALID_KEY';
    else if (status === 403 && /accessnotconfigured|servicedisabled|api.*disabled/.test(reason)) error.code = 'GOOGLE_BOOKS_API_DISABLED';
    else if (status === 403 && /quota|dailylimit|userratelimit/.test(reason)) error.code = 'GOOGLE_BOOKS_QUOTA_EXCEEDED';
    else if (status === 403) error.code = 'GOOGLE_BOOKS_PERMISSION_DENIED';
    else if (status === 429) error.code = 'GOOGLE_BOOKS_RATE_LIMITED';
    else if (status === 404) error.code = 'GOOGLE_BOOK_NOT_FOUND';
  }
  if (!error.code && cause?.name === 'TimeoutError') error.code = 'BOOK_PROVIDER_TIMEOUT';
  if (!error.code) error.code = 'BOOK_PROVIDER_UNAVAILABLE';
  return error;
}

/** Open Library is the primary discovery source; Google Books is the configured fallback. */
export function createOpenLibraryCatalogueRouter({ pool, fetchImpl = globalThis.fetch, env = process.env, now = Date.now } = {}) {
  const router = Router();
  const cache = new Map();
  let openLibraryQueue = Promise.resolve();
  let lastOpenLibraryRequestAt = 0;
  router.use(limiter);

  function waitForOpenLibrarySlot() {
    const request = openLibraryQueue.then(async () => {
      const wait = Math.max(0, 1000 - (now() - lastOpenLibraryRequestAt));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      lastOpenLibraryRequestAt = now();
    });
    openLibraryQueue = request.catch(() => {});
    return request;
  }

  async function requestJson(url, provider) {
    const cacheKey = url.toString();
    const hit = cache.get(cacheKey);
    if (hit && hit.until > now()) return hit.value;
    const stale = hit && hit.staleUntil > now() ? hit.value : null;
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (provider === 'openlibrary') await waitForOpenLibrarySlot();
        const response = await fetchImpl(cacheKey, {
          signal: AbortSignal.timeout(8000),
          headers: provider === 'openlibrary' ? { 'User-Agent': env.OPEN_LIBRARY_USER_AGENT || 'folio-bookstore/1.0' } : undefined,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const error = providerFailure(provider, response.status, payload);
          console.warn('[catalogue] provider request failed', JSON.stringify({ provider, code: error.code, status: error.status }));
          throw error;
        }
        const value = await response.json();
        const pathname = new URL(cacheKey).pathname;
        if (provider === 'openlibrary' && pathname === '/search.json' && !Array.isArray(value?.docs)) throw providerFailure(provider, response.status, null);
        if (provider === 'googlebooks' && pathname.endsWith('/volumes') && !Array.isArray(value?.items) && Number(value?.totalItems) !== 0) throw providerFailure(provider, response.status, null);
        cache.set(cacheKey, { until: now() + CACHE_MS, staleUntil: now() + 24 * 60 * 60_000, value });
        if (cache.size > 200) cache.delete(cache.keys().next().value);
        return value;
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && error.status !== 429) throw error;
        if (stale && (error.status >= 500 || error.status === 429)) return stale;
        const causeCode = error.cause?.code;
        if (error.name === 'TimeoutError' || error.name === 'AbortError' || error.cause?.name === 'TimeoutError' || causeCode === 'UND_ERR_CONNECT_TIMEOUT') error.code = 'BOOK_PROVIDER_TIMEOUT';
        else if (causeCode === 'EACCES' || causeCode === 'ENETUNREACH' || causeCode === 'ECONNREFUSED') error.code = 'BOOK_PROVIDER_NETWORK_ERROR';
        console.warn('[catalogue] provider transport failed', JSON.stringify({ provider, code: error.code || 'BOOK_PROVIDER_UNAVAILABLE', causeCode: causeCode || undefined }));
        if (stale && ['BOOK_PROVIDER_TIMEOUT', 'BOOK_PROVIDER_NETWORK_ERROR', 'BOOK_PROVIDER_UNAVAILABLE'].includes(error.code)) return stale;
        lastError = error;
        if (error.code && !['BOOK_PROVIDER_UNAVAILABLE', 'BOOK_PROVIDER_TIMEOUT', 'BOOK_PROVIDER_NETWORK_ERROR'].includes(error.code)) throw error;
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    if (!['BOOK_PROVIDER_TIMEOUT', 'BOOK_PROVIDER_NETWORK_ERROR'].includes(lastError?.code)) lastError.code = 'BOOK_PROVIDER_UNAVAILABLE';
    throw lastError;
  }

  async function findStoreProducts(books) {
    if (!pool) return new Map();
    // Exact, validated ISBNs and explicit Open Library work links can associate a
    // discovery record with Folio. Titles/authors alone never grant purchasability.
    const isbns = [...new Set(books.flatMap(book => book.isbns).filter(isValidIsbn).map(normalizeIsbn))];
    const workIds = [...new Set(books.filter(book => book.provider === 'openlibrary').map(book => book.id).filter(key => /^works\/OL\d+W$/.test(key)))];
    if (!isbns.length && !workIds.length) return new Map();
    const predicates = [];
    const values = [];
    if (isbns.length) { predicates.push('b.isbn IN (?)'); values.push(isbns); }
    if (workIds.length) { predicates.push('b.open_library_work_id IN (?)'); values.push(workIds); }
    const [rows] = await pool.query(
      `SELECT b.id, b.isbn, b.open_library_work_id, b.title, b.author, b.price, b.description, b.cover_image_url,
              c.name AS category, COALESCE(i.quantity, 0) AS quantity
         FROM books b JOIN categories c ON c.id = b.category_id LEFT JOIN inventory i ON i.book_id = b.id
        WHERE b.is_active = 1 AND (${predicates.join(' OR ')})`,
      values
    );
    return new Map(rows.flatMap(row => {
      const book = localBook(row);
      if (!book) return [];
      return [
        ...(isValidIsbn(row.isbn) ? [[normalizeIsbn(row.isbn), book]] : []),
        ...(row.open_library_work_id ? [[`work:${row.open_library_work_id}`, book]] : []),
      ];
    }));
  }

  async function attachStoreProducts(books) {
    if (presentationStoreEnabled(env) && pool) {
      return Promise.all(books.map(async book => {
        const productId = await resolvePresentationProduct(pool, book, env);
        const product = productId ? await findLocalBooksById(productId) : null;
        if (!product) return { ...book, price: null, currency: null, stockStatus: 'unavailable', available: false, storeProduct: null };
        return { ...book, price: product.price, currency: 'INR', stockStatus: product.stockStatus, available: product.available, storeProduct: product.storeProduct };
      }));
    }
    const products = await findStoreProducts(books);
    return books.map(book => {
      // A matching valid ISBN resolves to the local catalogue object itself. This
      // prevents external metadata from replacing the store's identity and ID.
      const match = book.isbns.map(normalizeIsbn).map(isbn => products.get(isbn)).find(Boolean)
        || (book.provider === 'openlibrary' ? products.get(`work:${book.id}`) : null);
      if (match) return match;
      const discoveryBook = {
        ...book, price: null, currency: null, stockStatus: 'unavailable', available: false, storeProduct: null,
      };
      if (book._providerIsbns) Object.defineProperty(discoveryBook, '_providerIsbns', { value: book._providerIsbns });
      return discoveryBook;
    });
  }

  async function searchLocalBooks(query) {
    if (!pool || !query) return [];
    const selected = `SELECT b.id, b.isbn, b.open_library_work_id, b.title, b.author, b.price, b.description, b.cover_image_url,
        c.name AS category, COALESCE(i.quantity, 0) AS quantity
      FROM books b JOIN categories c ON c.id = b.category_id
      LEFT JOIN inventory i ON i.book_id = b.id WHERE b.is_active = 1`;
    const matches = new Map();
    const exact = normalizeIsbn(query);
    if (/^[\dX]{10,13}$/.test(exact)) {
      const [rows] = await pool.query(`${selected} AND UPPER(REPLACE(REPLACE(b.isbn, '-', ''), ' ', '')) = ? ORDER BY b.id LIMIT 20`, [exact]);
      for (const row of rows) matches.set(String(row.id), row);
    }
    if (!matches.size && /^[1-9]\d{0,17}$/.test(query)) {
      const [rows] = await pool.query(`${selected} AND b.id = ? LIMIT 1`, [query]);
      for (const row of rows) matches.set(String(row.id), row);
    }
    const terms = query.split(/\s+/).filter(Boolean).slice(0, 8);
    const clauses = terms.map(() => '(b.title LIKE ? OR b.author LIKE ?)');
    const params = terms.flatMap(term => [`%${escapeLike(term)}%`, `%${escapeLike(term)}%`]);
    if (clauses.length) {
      const [rows] = await pool.query(`${selected} AND ${clauses.join(' AND ')} ORDER BY b.title, b.id LIMIT 100`, params);
      for (const row of rows) matches.set(String(row.id), row);
    }
    return [...matches.values()].map(localBook).filter(Boolean);
  }

  async function findLocalBooksById(id) {
    if (!pool) return null;
    const [rows] = await pool.query(
      `SELECT b.id, b.isbn, b.open_library_work_id, b.title, b.author, b.price, b.description, b.cover_image_url,
              c.name AS category, COALESCE(i.quantity, 0) AS quantity
         FROM books b JOIN categories c ON c.id = b.category_id
         LEFT JOIN inventory i ON i.book_id = b.id
        WHERE b.id = ? AND b.is_active = 1 LIMIT 1`, [id]
    );
    const book = localBook(rows[0]);
    if (book) book.storeProduct.availableQuantity = Number(rows[0].quantity);
    return book;
  }

  async function findLocalBooksByWorkId(workId) {
    if (!pool) return null;
    const [rows] = await pool.query(
      `SELECT b.id, b.isbn, b.open_library_work_id, b.title, b.author, b.price, b.description, b.cover_image_url,
              c.name AS category, COALESCE(i.quantity, 0) AS quantity
         FROM books b JOIN categories c ON c.id = b.category_id
         LEFT JOIN inventory i ON i.book_id = b.id
        WHERE b.open_library_work_id = ? AND b.is_active = 1 LIMIT 1`, [workId]
    );
    const book = localBook(rows[0]);
    if (book) book.storeProduct.availableQuantity = Number(rows[0].quantity);
    return book;
  }

  async function readOpenLibrary(url) { return requestJson(url, 'openlibrary'); }
  async function readGoogle(url) { return requestJson(url, 'googlebooks'); }

  async function searchProvider(req, provider, pagination = {}) {
    const q = text(req.query.q);
    const ids = String(req.query.category || '').split(',').filter(Boolean);
    const page = pagination.page ?? Number(req.query.page || 1);
    const pageSize = pagination.pageSize ?? Number(req.query.pageSize || 12);
    if (provider === 'openlibrary') {
      const url = new URL('https://openlibrary.org/search.json');
      url.searchParams.set('q', openLibraryQuery(q, ids));
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(pageSize));
      url.searchParams.set('fields', 'key,title,author_name,first_publish_year,publish_date,publisher,isbn,cover_i,subject,number_of_pages_median,has_fulltext');
      const data = await readOpenLibrary(url);
      const books = deduplicate(array(data.docs).map(doc => openLibraryBook(doc, {}, null)).filter(book => !ids.includes('18') || isAnimeManga(book.subjects)));
      return { books, totalItems: Number(data.num_found ?? data.numFound) || books.length, provider };
    }

    if (!env.GOOGLE_BOOKS_API_KEY) {
      const error = new Error('Google Books fallback is not configured.');
      error.code = 'GOOGLE_BOOKS_NOT_CONFIGURED';
      throw error;
    }
    const resultPageSize = Math.min(pageSize, 40);
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', googleQuery(q, ids));
    url.searchParams.set('startIndex', String((page - 1) * resultPageSize));
    url.searchParams.set('maxResults', String(resultPageSize));
    url.searchParams.set('orderBy', req.query.sort === 'newest' ? 'newest' : 'relevance');
    url.searchParams.set('key', env.GOOGLE_BOOKS_API_KEY);
    const data = await readGoogle(url);
    const books = deduplicate(array(data.items).map(googleBook).filter(book => !ids.includes('18') || isAnimeManga(book.subjects)));
    return { books, totalItems: Number(data.totalItems) || 0, provider, pageSize: resultPageSize };
  }

  async function lookupInventory(isbn) {
    if (!pool || !isValidIsbn(isbn)) return null;
    const [rows] = await pool.query(
      `SELECT b.id, b.isbn, b.open_library_work_id, b.title, b.author, b.price, b.description, b.cover_image_url,
              c.name AS category, COALESCE(i.quantity, 0) AS quantity
         FROM books b JOIN categories c ON c.id = b.category_id LEFT JOIN inventory i ON i.book_id = b.id
        WHERE b.is_active = 1 AND b.isbn = ? LIMIT 1`,
      [normalizeIsbn(isbn)]
    );
    return localBook(rows[0]);
  }

  router.get('/filters', (_req, res) => res.json({ filters: { categories: SUBJECTS.map((name, index) => ({ id: index + 1, name, bookCount: null })), priceRange: null } }));

  router.get('/books', async (req, res) => {
    try {
      const rawQuery = text(req.query.q);
      const categoryIds = String(req.query.category || '').split(',').filter(Boolean);
      const sort = String(req.query.sort || 'title');
      const order = String(req.query.order || 'asc');
      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.pageSize || 12);
      if (rawQuery.length > 100) return res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Search text can be at most 100 characters.' } });
      if (categoryIds.some(id => !/^(?:[1-9]|1[0-8])$/.test(id))) return res.status(400).json({ error: { code: 'INVALID_CATEGORY', message: 'Choose a valid category.' } });
      if (!['title', 'author', 'price', 'newest'].includes(sort) || !['asc', 'desc'].includes(order)) return res.status(400).json({ error: { code: 'INVALID_SORT', message: 'Choose title, author, store price, or publication year and a valid sort direction.' } });
      if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return res.status(400).json({ error: { code: 'INVALID_PAGINATION', message: 'Page or page size is invalid.' } });

      let localMatches = await searchLocalBooks(rawQuery);
      if (categoryIds.length) {
        localMatches = localMatches.filter(book => categoryIds.some(id => categoryMatches(book.category, SUBJECTS[Number(id) - 1], book.subjects)));
      }
      if (sort === 'title') localMatches.sort((a, b) => a.title.localeCompare(b.title) * (order === 'desc' ? -1 : 1));
      if (sort === 'author') localMatches.sort((a, b) => a.author.localeCompare(b.author) * (order === 'desc' ? -1 : 1));
      if (sort === 'price') localMatches.sort((a, b) => (a.price - b.price) * (order === 'desc' ? -1 : 1));
      const localSearchMode = localMatches.length > 0;
      const localStart = (page - 1) * pageSize;
      const localPage = localMatches.slice(localStart, localStart + pageSize);
      const externalSlots = pageSize - localPage.length;
      const externalOffset = Math.max(0, localStart + localPage.length - localMatches.length);
      const providerChunkSize = 40;
      const providerPage = localSearchMode ? Math.floor(externalOffset / providerChunkSize) + 1 : page;
      const providerIndex = localSearchMode ? externalOffset % providerChunkSize : 0;
      const providerPageSize = localSearchMode ? providerChunkSize : pageSize;
      let result;
      let providerError;
      try { result = await searchProvider(req, 'openlibrary', { page: providerPage, pageSize: providerPageSize }); }
      catch (openLibraryError) {
        try { result = await searchProvider(req, 'googlebooks', { page: providerPage, pageSize: providerPageSize }); }
        catch (googleError) {
          providerError = new Error(googleError.code === 'GOOGLE_BOOKS_NOT_CONFIGURED' ? googleError.message : 'Both book metadata providers are unavailable.');
          providerError.code = googleError.code || openLibraryError.code || 'BOOK_PROVIDER_UNAVAILABLE';
          providerError.fallbackConfigured = Boolean(env.GOOGLE_BOOKS_API_KEY);
          if (!localMatches.length) throw providerError;
          result = { books: [], totalItems: 0, provider: 'local' };
        }
      }

      // Open Library can return a syntactically valid but empty/low quality response.
      // Try Google Books when configured, while retaining the primary results if fallback fails.
      if (result.provider === 'openlibrary' && result.books.length < Math.min(2, pageSize) && env.GOOGLE_BOOKS_API_KEY) {
        try {
          const fallback = await searchProvider(req, 'googlebooks', { page: providerPage, pageSize: providerPageSize });
          if (fallback.books.length) result = { ...fallback, books: deduplicate([...result.books, ...fallback.books]).slice(0, providerPageSize) };
        }
        catch (error) { console.warn('[catalogue] Google Books empty-result fallback failed', JSON.stringify({ code: error.code || 'BOOK_PROVIDER_UNAVAILABLE' })); }
      }

      const externalBooks = await attachStoreProducts(result.books);
      const queryIdentifier = normalizeIsbn(rawQuery);
      const localIds = new Set(localMatches.map(book => String(book.id)));
      const invalidIdentifierConflict = book => page === 1 && /^[\dX]{10,13}$/.test(queryIdentifier)
        && localMatches.some(local => normalizeIsbn(local.isbn) === queryIdentifier)
        && book.provider !== 'local' && (book._providerIsbns || book.isbns).some(isbn => normalizeIsbn(isbn) === queryIdentifier);
      const suppressedProviderResults = externalBooks.filter(invalidIdentifierConflict).length;
      const eligibleExternal = externalBooks.filter(book => {
        if (book.provider === 'local' && localIds.has(String(book.id))) return false;
        // A matching malformed stored identifier suppresses misleading provider
        // metadata but never grants it a local product association.
        if (invalidIdentifierConflict(book)) return false;
        return true;
      });
      const pageExternal = localSearchMode ? eligibleExternal.slice(providerIndex, providerIndex + externalSlots) : eligibleExternal;
      let books = [...localPage, ...pageExternal];
      books = deduplicate(books);
      const minimumPrice = req.query.minPrice === undefined ? null : Number(req.query.minPrice);
      const maximumPrice = req.query.maxPrice === undefined ? null : Number(req.query.maxPrice);
      const availability = String(req.query.availability || 'all');
      if ((minimumPrice !== null && (!Number.isFinite(minimumPrice) || minimumPrice < 0))
        || (maximumPrice !== null && (!Number.isFinite(maximumPrice) || maximumPrice < 0))
        || !['all', 'in_stock', 'out_of_stock'].includes(availability)) {
        return res.status(400).json({ error: { code: 'INVALID_FILTER', message: 'Choose a valid store price range and availability filter.' } });
      }
      if (minimumPrice !== null) books = books.filter(book => book.price !== null && book.price >= minimumPrice);
      if (maximumPrice !== null) books = books.filter(book => book.price !== null && book.price <= maximumPrice);
      if (availability === 'in_stock') books = books.filter(book => book.storeProduct?.available);
      if (availability === 'out_of_stock') books = books.filter(book => Boolean(book.storeProduct) && !book.storeProduct.available);
      if (sort === 'title') books.sort((a, b) => a.title.localeCompare(b.title) * (order === 'desc' ? -1 : 1));
      if (sort === 'author') books.sort((a, b) => a.author.localeCompare(b.author) * (order === 'desc' ? -1 : 1));
      if (sort === 'price') books.sort((a, b) => {
        if (a.price == null) return b.price == null ? a.title.localeCompare(b.title) : 1;
        if (b.price == null) return -1;
        return (a.price - b.price) * (order === 'desc' ? -1 : 1);
      });
      if (sort === 'newest') books.sort((a, b) => ((a.firstPublishYear || 0) - (b.firstPublishYear || 0)) * (order === 'desc' ? -1 : 1));
      const localAdditions = localSearchMode ? localMatches.filter(local => !externalBooks.some(external =>
        (external.provider === 'local' && String(external.id) === String(local.id))
        || (isValidIsbn(local.isbn) && external.isbns?.some(isbn => normalizeIsbn(isbn) === normalizeIsbn(local.isbn)))
        || (normalizeName(external.title) === normalizeName(local.title) && normalizeName(external.author) === normalizeName(local.author)))).length : 0;
      const totalItems = Math.max(localMatches.length, result.totalItems - suppressedProviderResults + localAdditions);
      const responsePageSize = localSearchMode ? pageSize : result.pageSize || pageSize;
      const totalPages = Math.ceil(totalItems / responsePageSize);
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ books, pagination: { page, pageSize: responsePageSize, totalItems, totalPages }, source: result.provider, ...(providerError ? { providerNotice: 'Showing local catalogue results while discovery providers are unavailable.' } : {}) });
    } catch (error) {
      console.warn('[catalogue] request failed', JSON.stringify({ code: error.code || 'UNKNOWN', name: error.name || 'Error' }));
      const { status, body } = publicError(error, { fallbackConfigured: Boolean(env.GOOGLE_BOOKS_API_KEY) });
      res.status(status).json(body);
    }
  });

  router.get('/books/:bookId', async (req, res) => {
    try {
      let book;
      if (/^[1-9]\d{0,17}$/.test(req.params.bookId)) {
        book = await findLocalBooksById(req.params.bookId);
        if (!book) return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'We could not find that local book.' } });
        return res.json({ book });
      } else if (/^works\/OL\d+W$/.test(req.params.bookId)) {
        const key = req.params.bookId;
        book = await findLocalBooksByWorkId(key);
        if (book) return res.json({ book });
        const [work, search] = await Promise.all([
          readOpenLibrary(new URL(`https://openlibrary.org/${key}.json`)),
          readOpenLibrary(new URL(`https://openlibrary.org/search.json?${new URLSearchParams({ q: `key:${key}`, fields: 'key,title,author_name,first_publish_year,publish_date,publisher,isbn,cover_i,subject,number_of_pages_median', limit: '1' })}`)),
        ]);
        const doc = array(search.docs)[0] || {};
        let reading = null;
        const isbn = array(doc.isbn)[0];
        try {
          const idType = isbn ? 'isbn' : 'olid';
          const id = isbn || key.split('/').at(-1);
          const availability = await readOpenLibrary(new URL(`https://openlibrary.org/api/volumes/brief/${idType}/${encodeURIComponent(id)}.json`));
          const item = array(availability.items)[0];
          if (item) {
            let readerUrl = null;
            try {
              const candidate = new URL(item.itemURL);
              if (candidate.protocol === 'https:' && ['archive.org', 'www.archive.org', 'openlibrary.org', 'www.openlibrary.org'].includes(candidate.hostname)) readerUrl = candidate.toString();
            } catch { /* no safe reader URL */ }
            reading = { status: item.status || 'unknown', url: readerUrl, match: item.match };
          }
        } catch { /* reading links are optional metadata */ }
        book = openLibraryBook({ ...doc, key }, work, reading);
      } else if (/^volumes\/[\w-]+$/.test(req.params.bookId)) {
        if (!env.GOOGLE_BOOKS_API_KEY) return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Google Books details are unavailable until fallback is configured.' } });
        const volumeId = req.params.bookId.slice('volumes/'.length);
        const url = new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(volumeId)}`);
        url.searchParams.set('key', env.GOOGLE_BOOKS_API_KEY);
        const volume = await readGoogle(url);
        book = googleBook(volume, { large: true });
      } else {
        return res.status(400).json({ error: { code: 'INVALID_BOOK_ID', message: 'This book link is not valid.' } });
      }
      if (presentationStoreEnabled(env) && pool) {
        const productId = await resolvePresentationProduct(pool, book, env);
        const product = productId ? await findLocalBooksById(productId) : null;
        if (product) return res.json({ book: { ...book, price: product.price, currency: 'INR', stockStatus: product.stockStatus, available: product.available, storeProduct: product.storeProduct, inventoryDetails: product } });
      }
      const inventory = await lookupInventory(book.isbn);
      if (inventory) return res.json({ book: inventory });
      const storeProduct = null;
      res.json({ book: { ...book, price: storeProduct?.price ?? null, currency: storeProduct?.currency ?? null, stockStatus: storeProduct?.stockStatus ?? 'unavailable', available: Boolean(storeProduct?.available), storeProduct, inventoryDetails: inventory } });
    } catch (error) {
      const status = error.status === 404 ? 404 : 502;
      res.status(status).json({ error: { code: error.code || 'BOOK_PROVIDER_UNAVAILABLE', message: status === 404 ? 'We could not find that book.' : 'Book details are temporarily unavailable. Please try again shortly.' } });
    }
  });
  return router;
}
