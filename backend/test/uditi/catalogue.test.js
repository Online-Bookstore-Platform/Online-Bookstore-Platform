import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase, databaseTests, startTestServer } from './helpers.js';
import { parseCatalogueQuery } from '../../src/features/uditi/catalogue/catalogue.validation.js';

describe('catalogue query validation (unit)', () => {
  const parse = query => parseCatalogueQuery(query);

  it('applies defaults', () => {
    assert.deepEqual(parse({}), {
      filters: { terms: [], categoryIds: [], author: undefined, minPrice: undefined, maxPrice: undefined, availability: 'all' },
      sort: { field: 'title', order: 'asc' },
      page: 1,
      pageSize: 12,
    });
  });

  it('splits the search text into words and the category list into numbers', () => {
    const { filters } = parse({ q: '  jane   austen ', category: '3, 5,3' });
    assert.deepEqual(filters.terms, ['jane', 'austen']);
    assert.deepEqual(filters.categoryIds, [3, 5]);
  });

  it('sorts "newest" newest-first unless told otherwise', () => {
    assert.deepEqual(parse({ sort: 'newest' }).sort, { field: 'newest', order: 'desc' });
    assert.deepEqual(parse({ sort: 'price', order: 'DESC' }).sort, { field: 'price', order: 'desc' });
  });

  it('reads prices as plain decimals only', () => {
    assert.equal(parse({ minPrice: '149.99' }).filters.minPrice, 149.99);
    for (const bad of ['1e3', '-1', '12.345', '$5', 'NaN', '0x10']) {
      assert.throws(() => parse({ maxPrice: bad }), error => error.status === 400 && error.details[0].field === 'maxPrice', bad);
    }
  });

  it('collects all problems into one 400', () => {
    assert.throws(
      () => parse({ sort: 'rating', page: '0', category: 'x', availability: 'maybe' }),
      error => error.status === 400 && error.code === 'VALIDATION_ERROR' && error.details.length === 4
    );
  });

  it('treats blank values as absent and ignores unknown parameters', () => {
    const result = parse({ q: '   ', author: '', minPrice: '', unknown: 'x' });
    assert.deepEqual(result.filters.terms, []);
    assert.equal(result.filters.author, undefined);
  });
});

describe('GET /api/catalogue/books (browse, search, filter, sort)', databaseTests, () => {
  let testDb;
  let api;

  before(async () => {
    testDb = await createTestDatabase({ seed: true });
    api = await startTestServer(testDb.pool);
  });
  after(async () => {
    await api.close();
    await testDb.drop();
  });

  const list = (query = '') => api.get(`/api/catalogue/books${query ? `?${query}` : ''}`);
  const titles = response => response.body.books.map(book => book.title);

  describe('browsing', () => {
    it('returns the first page of the catalogue sorted by title', async () => {
      const response = await list();
      assert.equal(response.status, 200);
      assert.equal(response.body.books.length, 12);
      assert.deepEqual(response.body.pagination, { page: 1, pageSize: 12, totalItems: 25, totalPages: 3 });
      assert.deepEqual(titles(response), [...titles(response)].sort((a, b) => a.localeCompare(b)));
    });

    it('describes each book with the fields the cards and the details page share', async () => {
      const [book] = (await list('q=Pride')).body.books;
      assert.deepEqual(Object.keys(book).sort(), ['author', 'available', 'category', 'categoryId', 'coverImageUrl', 'currency', 'id', 'isbn', 'price', 'stockStatus', 'title']);
      assert.equal(book.category, 'Classics');
      assert.equal(book.currency, 'INR');
      assert.equal(typeof book.price, 'number');
      assert.equal(book.stockStatus, 'in_stock');
    });

    it('never exposes exact stock quantities to customers', async () => {
      const response = await list('pageSize=50');
      assert.doesNotMatch(JSON.stringify(response.body), /"quantity"|"stock":/);
    });

    it('pages through the whole catalogue without repeating or skipping books', async () => {
      const seen = [];
      for (let page = 1; page <= 3; page++) seen.push(...(await list(`page=${page}&pageSize=10`)).body.books.map(book => book.id));
      assert.equal(seen.length, 25);
      assert.equal(new Set(seen).size, 25);
    });

    it('returns an empty page (not an error) beyond the last page', async () => {
      const response = await list('page=99');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.books, []);
      assert.equal(response.body.pagination.totalItems, 25);
    });
  });

  describe('search', () => {
    it('finds books by part of the title, ignoring case', async () => {
      assert.deepEqual(titles(await list('q=pRiDe')), ['Pride and Prejudice']);
    });

    it('finds books by author', async () => {
      assert.deepEqual(titles(await list('q=austen')), ['Emma', 'Pride and Prejudice']);
    });

    it('ignores accents ("bronte" finds Brontë)', async () => {
      assert.deepEqual(titles(await list('q=bronte')), ['Jane Eyre', 'Wuthering Heights']);
    });

    it('finds books by category name', async () => {
      assert.deepEqual(titles(await list('q=mystery')), ['The Adventures of Sherlock Holmes', 'The Hound of the Baskervilles', 'The Moonstone']);
    });

    it('finds a book by its full ISBN, with or without hyphens, or by the start of it', async () => {
      const [{ isbn }] = (await list('q=Pride')).body.books;
      const hyphenated = `${isbn.slice(0, 3)}-${isbn.slice(3, 4)}-${isbn.slice(4, 7)}-${isbn.slice(7, 12)}-${isbn.slice(12)}`;
      for (const q of [isbn, hyphenated, isbn.slice(0, 9)]) {
        assert.ok(titles(await list(`q=${encodeURIComponent(q)}`)).includes('Pride and Prejudice'), `query "${q}" should find the book`);
      }
      assert.deepEqual(titles(await list(`q=${isbn}`)), ['Pride and Prejudice']);
    });

    it('requires every word to match somewhere (title, author, category)', async () => {
      assert.deepEqual(titles(await list('q=austen+pride')), ['Pride and Prejudice']);
      assert.deepEqual(titles(await list('q=austen+dracula')), []);
    });

    it('treats % and _ as ordinary characters', async () => {
      assert.deepEqual((await list('q=%25')).body.books, []);
      assert.deepEqual((await list('q=_')).body.books, []);
    });

    it('is safe against SQL injection attempts', async () => {
      for (const attack of ["' OR 1=1 --", "'; DROP TABLE books; --", '" OR ""="', '\\']) {
        const response = await list(`q=${encodeURIComponent(attack)}`);
        assert.equal(response.status, 200, attack);
        assert.deepEqual(response.body.books, [], attack);
      }
      assert.equal((await list()).body.pagination.totalItems, 25);
    });

    it('reports no results as an empty list with zero pages', async () => {
      const response = await list('q=zzzznotabook');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.books, []);
      assert.deepEqual(response.body.pagination, { page: 1, pageSize: 12, totalItems: 0, totalPages: 0 });
    });
  });

  describe('filters', () => {
    it('filters by category, including several categories at once', async () => {
      const { categories } = (await api.get('/api/catalogue/filters')).body.filters;
      const id = name => categories.find(category => category.name === name).id;

      const classics = await list(`category=${id('Classics')}&pageSize=50`);
      assert.equal(classics.body.pagination.totalItems, 7);
      assert.ok(classics.body.books.every(book => book.category === 'Classics'));

      const both = await list(`category=${id('Classics')},${id('Horror')}&pageSize=50`);
      assert.equal(both.body.pagination.totalItems, 9);
    });

    it('filters by author', async () => {
      assert.deepEqual(titles(await list(`author=${encodeURIComponent('Robert Louis Stevenson')}`)), ['Strange Case of Dr Jekyll and Mr Hyde', 'Treasure Island']);
    });

    it('filters by price range, inclusive at both ends', async () => {
      const response = await list('minPrice=249&maxPrice=279&pageSize=50&sort=price');
      const prices = response.body.books.map(book => book.price);
      assert.ok(prices.length > 0);
      assert.ok(prices.every(price => price >= 249 && price <= 279));
      assert.ok(prices.includes(249) && prices.includes(279), 'boundary prices must be included');

      assert.deepEqual(titles(await list('maxPrice=189&pageSize=50')), ['Gitanjali', 'Strange Case of Dr Jekyll and Mr Hyde']);
    });

    it('filters by availability and labels low stock', async () => {
      const inStock = await list('availability=in_stock&pageSize=50');
      assert.equal(inStock.body.pagination.totalItems, 23);
      assert.ok(inStock.body.books.every(book => book.available));

      const out = await list('availability=out_of_stock');
      assert.deepEqual(titles(out), ['Leaves of Grass', 'Moby-Dick']);
      assert.ok(out.body.books.every(book => !book.available && book.stockStatus === 'out_of_stock'));

      const frankenstein = (await list('q=Frankenstein')).body.books[0];
      assert.equal(frankenstein.stockStatus, 'low_stock'); // 2 copies
      assert.equal(frankenstein.available, true);
    });

    it('combines search, filters and sorting', async () => {
      assert.deepEqual(titles(await list('q=jules&availability=in_stock&maxPrice=300&sort=price&order=desc')), ['Around the World in Eighty Days']);
    });

    it('combines every filter at once and counts the total correctly', async () => {
      const { categories } = (await api.get('/api/catalogue/filters')).body.filters;
      const classics = categories.find(category => category.name === 'Classics').id;
      const response = await list(`q=jane&category=${classics}&minPrice=250&maxPrice=350&availability=in_stock&sort=price&order=asc&page=1&pageSize=1`);
      assert.equal(response.status, 200);
      const all = await list(`q=jane&category=${classics}&minPrice=250&maxPrice=350&availability=in_stock&pageSize=50`);
      assert.equal(response.body.pagination.totalItems, all.body.books.length);
      assert.equal(response.body.pagination.totalPages, all.body.books.length);
      assert.ok(all.body.books.every(book => /jane/i.test(`${book.title} ${book.author} ${book.category}`) && book.price >= 250 && book.price <= 350));
    });
  });

  describe('sorting', () => {
    const column = (response, key) => response.body.books.map(book => book[key]);

    it('sorts by price ascending and descending', async () => {
      const asc = column(await list('sort=price&pageSize=50'), 'price');
      assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
      assert.deepEqual(column(await list('sort=price&order=desc&pageSize=50'), 'price'), [...asc].reverse());
    });

    it('sorts by title (A-Z and Z-A) and by author', async () => {
      const az = titles(await list('sort=title&pageSize=50'));
      assert.deepEqual(titles(await list('sort=title&order=desc&pageSize=50')), [...az].reverse());
      const byAuthor = column(await list('sort=author&pageSize=50'), 'author');
      assert.deepEqual(byAuthor, [...byAuthor].sort((a, b) => a.localeCompare(b)));
    });

    it('shows the newest additions first when sorted by "newest"', async () => {
      const ids = column(await list('sort=newest&pageSize=50'), 'id');
      assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
    });

    it('keeps the order stable across pages when many books share a value', async () => {
      const first = (await list('sort=author&pageSize=7&page=1')).body.books.map(book => book.id);
      const second = (await list('sort=author&pageSize=7&page=2')).body.books.map(book => book.id);
      assert.equal(new Set([...first, ...second]).size, 14);
    });
  });

  describe('validation', () => {
    async function assertRejected(query, field) {
      const response = await list(query);
      assert.equal(response.status, 400, `expected 400 for ${query}`);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
      assert.ok(response.body.error.details.some(detail => detail.field === field), `expected a problem reported for "${field}"`);
    }

    it('rejects unknown sort fields (and SQL smuggled through them)', async () => {
      await assertRejected('sort=rating', 'sort');
      await assertRejected(`sort=${encodeURIComponent('title; DROP TABLE books')}`, 'sort');
      await assertRejected('order=sideways', 'order');
    });

    it('rejects bad prices and an inverted price range', async () => {
      await assertRejected('minPrice=abc', 'minPrice');
      await assertRejected('maxPrice=-5', 'maxPrice');
      await assertRejected('minPrice=500&maxPrice=100', 'minPrice');
    });

    it('rejects bad paging values', async () => {
      await assertRejected('page=0', 'page');
      await assertRejected('page=abc', 'page');
      await assertRejected('pageSize=1000', 'pageSize');
    });

    it('rejects bad categories, availability and over-long search text', async () => {
      await assertRejected('category=abc', 'category');
      await assertRejected('category=1,,2', 'category');
      await assertRejected('availability=maybe', 'availability');
      await assertRejected(`q=${'x'.repeat(101)}`, 'q');
    });

    it('rejects a parameter given twice', async () => {
      await assertRejected('sort=price&sort=title', 'sort');
    });

    it('reports every problem at once, in plain language, without internals', async () => {
      const response = await list('sort=rating&page=0&minPrice=x');
      assert.equal(response.body.error.details.length, 3);
      assert.match(response.body.error.message, /not valid/i);
      assert.doesNotMatch(JSON.stringify(response.body), /sql|stack|undefined/i);
    });
  });

  describe('inactive books', () => {
    it('hides removed (inactive) books from the listing and the filter counts', async () => {
      const [book] = (await list('q=Moonstone')).body.books;
      assert.ok(book);

      await testDb.pool.query('UPDATE books SET is_active = 0 WHERE id = ?', [book.id]);
      try {
        assert.equal((await list('q=Moonstone')).body.books.length, 0);
        assert.equal((await list()).body.pagination.totalItems, 24);
        const { categories } = (await api.get('/api/catalogue/filters')).body.filters;
        assert.equal(categories.find(category => category.name === 'Mystery').bookCount, 2);
      } finally {
        await testDb.pool.query('UPDATE books SET is_active = 1 WHERE id = ?', [book.id]);
      }
    });
  });

  describe('real data, not a hardcoded list', () => {
    it('shows a book the moment it is added to the database, with its real stock label', async () => {
      await testDb.pool.query("INSERT INTO books (isbn, title, author, category_id, price) VALUES ('9781111111111', 'Brand New Arrival', 'Zed Newcomer', 1, 123.45)");
      const [[{ id }]] = await testDb.pool.query("SELECT id FROM books WHERE isbn = '9781111111111'");
      // no inventory row at all counts as out of stock
      assert.equal((await list('q=Brand+New')).body.books[0].stockStatus, 'out_of_stock');
      await testDb.pool.query('INSERT INTO inventory (book_id, quantity) VALUES (?, 3)', [id]);
      const [book] = (await list('q=Brand+New')).body.books;
      assert.equal(book.stockStatus, 'low_stock');
      assert.equal(book.price, 123.45);
    });
  });
});

describe('GET /api/catalogue/filters', databaseTests, () => {
  let testDb;
  let api;

  before(async () => {
    testDb = await createTestDatabase({ seed: true });
    api = await startTestServer(testDb.pool);
  });
  after(async () => {
    await api.close();
    await testDb.drop();
  });

  it('lists categories (with counts), authors and the price range for the filter controls', async () => {
    const { filters } = (await api.get('/api/catalogue/filters')).body;
    assert.equal(filters.categories.length, 7);
    assert.equal(filters.categories.find(category => category.name === 'Classics').bookCount, 7);
    assert.deepEqual(filters.authors, [...filters.authors].sort((a, b) => a.localeCompare(b)));
    assert.ok(filters.authors.includes('Jane Austen'));
    assert.equal(filters.authorsTruncated, false);
    assert.deepEqual(filters.priceRange, { min: 179, max: 599 });
  });

  it('is public (no sign-in needed) and answers unknown routes with a JSON 404', async () => {
    assert.equal((await api.get('/api/catalogue/books')).status, 200);
    const missing = await api.get('/api/catalogue/nothing-here');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');
  });
});
