'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, startTestServer } = require('./helpers');

describe('GET /api/books (browse, search, filter, sort)', () => {
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

  const titles = (res) => res.body.data.map((b) => b.title);

  describe('browsing', () => {
    it('returns the first page of the catalogue sorted by title', async () => {
      const res = await api.get('/api/books');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 12);
      assert.deepEqual(res.body.pagination, { page: 1, pageSize: 12, totalItems: 25, totalPages: 3 });
      const sorted = [...titles(res)].sort((a, b) => a.localeCompare(b));
      assert.deepEqual(titles(res), sorted);
    });

    it('describes each book without leaking exact stock levels', async () => {
      const res = await api.get('/api/books?q=Pride');
      const [book] = res.body.data;
      assert.deepEqual(Object.keys(book).sort(), [
        'author',
        'category',
        'coverImageUrl',
        'id',
        'inStock',
        'isbn',
        'price',
        'stockStatus',
        'title',
      ]);
      assert.deepEqual(book.category.name, 'Classics');
      assert.equal(typeof book.price, 'number');
      assert.equal(book.stockStatus, 'in_stock');
    });

    it('pages through the whole catalogue without repeating or skipping books', async () => {
      const seen = [];
      for (let page = 1; page <= 3; page++) {
        const res = await api.get(`/api/books?page=${page}&pageSize=10`);
        seen.push(...res.body.data.map((b) => b.id));
      }
      assert.equal(seen.length, 25);
      assert.equal(new Set(seen).size, 25);
    });

    it('returns an empty page (not an error) beyond the last page', async () => {
      const res = await api.get('/api/books?page=99');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, []);
      assert.equal(res.body.pagination.totalItems, 25);
    });
  });

  describe('search', () => {
    it('finds books by part of the title, ignoring case', async () => {
      const res = await api.get('/api/books?q=pRiDe');
      assert.deepEqual(titles(res), ['Pride and Prejudice']);
    });

    it('finds books by author', async () => {
      const res = await api.get('/api/books?q=austen');
      assert.deepEqual(titles(res), ['Emma', 'Pride and Prejudice']);
    });

    it('ignores accents ("bronte" finds Brontë)', async () => {
      const res = await api.get('/api/books?q=bronte');
      assert.deepEqual(titles(res), ['Jane Eyre', 'Wuthering Heights']);
    });

    it('finds books by category name', async () => {
      const res = await api.get('/api/books?q=mystery');
      assert.deepEqual(titles(res), [
        'The Adventures of Sherlock Holmes',
        'The Hound of the Baskervilles',
        'The Moonstone',
      ]);
    });

    it('finds a book by its full ISBN, with or without hyphens, or by the start of it', async () => {
      const [{ isbn }] = (await api.get('/api/books?q=Pride')).body.data;
      const hyphenated = `${isbn.slice(0, 3)}-${isbn.slice(3, 4)}-${isbn.slice(4, 7)}-${isbn.slice(7, 12)}-${isbn.slice(12)}`;
      for (const q of [isbn, hyphenated, isbn.slice(0, 9)]) {
        const res = await api.get(`/api/books?q=${encodeURIComponent(q)}`);
        assert.ok(titles(res).includes('Pride and Prejudice'), `query "${q}" should find the book`);
      }
      const exact = await api.get(`/api/books?q=${isbn}`);
      assert.deepEqual(titles(exact), ['Pride and Prejudice']);
    });

    it('requires every word to match somewhere (title, author, category)', async () => {
      assert.deepEqual(titles(await api.get('/api/books?q=austen+pride')), ['Pride and Prejudice']);
      assert.deepEqual(titles(await api.get('/api/books?q=austen+dracula')), []);
    });

    it('treats % and _ as ordinary characters', async () => {
      assert.deepEqual((await api.get('/api/books?q=%25')).body.data, []);
      assert.deepEqual((await api.get('/api/books?q=_')).body.data, []);
    });

    it('is safe against SQL injection attempts', async () => {
      const res = await api.get(`/api/books?q=${encodeURIComponent("' OR 1=1 --")}`);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, []);
      assert.equal((await api.get('/api/books')).body.pagination.totalItems, 25);
    });

    it('reports no results as an empty list with zero pages', async () => {
      const res = await api.get('/api/books?q=zzzznotabook');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, []);
      assert.deepEqual(res.body.pagination, { page: 1, pageSize: 12, totalItems: 0, totalPages: 0 });
    });
  });

  describe('filters', () => {
    it('filters by category, including several categories at once', async () => {
      const filters = (await api.get('/api/books/filters')).body.data;
      const id = (name) => filters.categories.find((c) => c.name === name).id;

      const classics = await api.get(`/api/books?category=${id('Classics')}&pageSize=50`);
      assert.equal(classics.body.pagination.totalItems, 7);
      assert.ok(classics.body.data.every((b) => b.category.name === 'Classics'));

      const both = await api.get(`/api/books?category=${id('Classics')},${id('Horror')}&pageSize=50`);
      assert.equal(both.body.pagination.totalItems, 9);
    });

    it('filters by author', async () => {
      const res = await api.get(`/api/books?author=${encodeURIComponent('Robert Louis Stevenson')}`);
      assert.deepEqual(titles(res), ['Strange Case of Dr Jekyll and Mr Hyde', 'Treasure Island']);
    });

    it('filters by price range, inclusive at both ends', async () => {
      const res = await api.get('/api/books?minPrice=249&maxPrice=279&pageSize=50&sort=price');
      assert.ok(res.body.data.length > 0);
      const prices = res.body.data.map((b) => b.price);
      assert.ok(prices.every((p) => p >= 249 && p <= 279));
      assert.ok(prices.includes(249) && prices.includes(279), 'boundary prices must be included');

      const onlyMax = await api.get('/api/books?maxPrice=189&pageSize=50');
      assert.deepEqual(titles(onlyMax), ['Gitanjali', 'Strange Case of Dr Jekyll and Mr Hyde']);
    });

    it('filters by availability and labels low stock', async () => {
      const inStock = await api.get('/api/books?availability=in_stock&pageSize=50');
      assert.equal(inStock.body.pagination.totalItems, 23);
      assert.ok(inStock.body.data.every((b) => b.inStock));

      const out = await api.get('/api/books?availability=out_of_stock');
      assert.deepEqual(titles(out), ['Leaves of Grass', 'Moby-Dick']);
      assert.ok(out.body.data.every((b) => !b.inStock && b.stockStatus === 'out_of_stock'));

      const frankenstein = (await api.get('/api/books?q=Frankenstein')).body.data[0];
      assert.equal(frankenstein.stockStatus, 'low_stock'); // 2 copies
      assert.equal(frankenstein.inStock, true);
    });

    it('combines search, filters and sorting', async () => {
      const res = await api.get('/api/books?q=jules&availability=in_stock&maxPrice=300&sort=price&order=desc');
      assert.deepEqual(titles(res), ['Around the World in Eighty Days']);
    });
  });

  describe('sorting', () => {
    const column = (res, key) => res.body.data.map((b) => b[key]);

    it('sorts by price ascending and descending', async () => {
      const asc = column(await api.get('/api/books?sort=price&pageSize=50'), 'price');
      assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
      const desc = column(await api.get('/api/books?sort=price&order=desc&pageSize=50'), 'price');
      assert.deepEqual(desc, [...asc].reverse());
    });

    it('sorts by title (A-Z and Z-A) and by author', async () => {
      const az = titles(await api.get('/api/books?sort=title&pageSize=50'));
      const za = titles(await api.get('/api/books?sort=title&order=desc&pageSize=50'));
      assert.deepEqual(za, [...az].reverse());

      const byAuthor = column(await api.get('/api/books?sort=author&pageSize=50'), 'author');
      assert.deepEqual(byAuthor, [...byAuthor].sort((a, b) => a.localeCompare(b)));
    });

    it('shows the newest additions first when sorted by "newest"', async () => {
      const ids = column(await api.get('/api/books?sort=newest&pageSize=50'), 'id');
      assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
    });

    it('keeps the order stable across pages when many books share a value', async () => {
      // price ties exist in the sample data; paging must still never repeat a book
      const first = (await api.get('/api/books?sort=author&pageSize=7&page=1')).body.data.map((b) => b.id);
      const second = (await api.get('/api/books?sort=author&pageSize=7&page=2')).body.data.map((b) => b.id);
      assert.equal(new Set([...first, ...second]).size, 14);
    });
  });

  describe('validation', () => {
    async function assertRejected(query, field) {
      const res = await api.get(`/api/books?${query}`);
      assert.equal(res.status, 400, `expected 400 for ${query}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.details.some((d) => d.field === field), `expected a problem reported for "${field}"`);
      return res.body.error;
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

    it('reports every problem at once, in plain language', async () => {
      const res = await api.get('/api/books?sort=rating&page=0&minPrice=x');
      assert.equal(res.body.error.details.length, 3);
      assert.match(res.body.error.message, /not valid/i);
      assert.doesNotMatch(JSON.stringify(res.body), /sql|stack|undefined/i);
    });
  });

  describe('inactive books', () => {
    it('hides removed (inactive) books from every endpoint', async () => {
      const { data } = (await api.get('/api/books?q=Moonstone')).body;
      assert.equal(data.length, 1);
      const bookId = data[0].id;

      await testDb.pool.query('UPDATE books SET is_active = 0 WHERE id = ?', [bookId]);
      try {
        assert.equal((await api.get('/api/books?q=Moonstone')).body.data.length, 0);
        assert.equal((await api.get(`/api/books/${bookId}`)).status, 404);
        assert.equal((await api.get('/api/books')).body.pagination.totalItems, 24);
        const filters = (await api.get('/api/books/filters')).body.data;
        assert.equal(filters.categories.find((c) => c.name === 'Mystery').bookCount, 2);
      } finally {
        await testDb.pool.query('UPDATE books SET is_active = 1 WHERE id = ?', [bookId]);
      }
    });
  });
});

describe('GET /api/books/:id and /api/books/filters', () => {
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

  it('returns the full details of a book, including its description', async () => {
    const [{ id }] = (await api.get('/api/books?q=Dracula')).body.data;
    const res = await api.get(`/api/books/${id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.title, 'Dracula');
    assert.equal(res.body.data.author, 'Bram Stoker');
    assert.equal(res.body.data.category.name, 'Horror');
    assert.match(res.body.data.description, /Transylvania/);
  });

  it('answers 404 for unknown or malformed ids', async () => {
    for (const id of ['999999', 'abc', '0', '-1', '1.5', '1e3']) {
      const res = await api.get(`/api/books/${id}`);
      assert.equal(res.status, 404, `id "${id}"`);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }
  });

  it('lists categories (with counts), authors and the price range for the filter controls', async () => {
    const { data } = (await api.get('/api/books/filters')).body;
    assert.equal(data.categories.length, 7);
    assert.deepEqual(data.categories.find((c) => c.name === 'Classics').bookCount, 7);
    assert.deepEqual(data.authors, [...data.authors].sort((a, b) => a.localeCompare(b)));
    assert.ok(data.authors.includes('Jane Austen'));
    assert.equal(data.authorsTruncated, false);
    assert.deepEqual(data.priceRange, { min: 179, max: 599 });
  });

  it('answers unknown API routes with a JSON 404', async () => {
    const res = await api.get('/api/nothing-here');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});
