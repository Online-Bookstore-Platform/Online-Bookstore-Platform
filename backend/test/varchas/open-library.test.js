import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';

test('Open Library catalogue serves live-shaped search and selected work details', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname === '/search.json') return Response.json({ numFound: 1, docs: [{ key: '/works/OL123W', title: 'Example Work', author_name: ['A. Author'], first_publish_year: 1901, publish_date: ['1901'], publisher: ['Example Press'], isbn: ['123456789X'], cover_i: 42, subject: ['Fiction'], has_fulltext: true }] });
    if (url.pathname === '/works/OL123W.json') return Response.json({ title: 'Example Work', description: { value: 'A provider supplied description.' }, subjects: ['Fiction', 'Classics'] });
    if (url.pathname.startsWith('/api/volumes/brief/')) return Response.json({ items: [{ status: 'full access', itemURL: 'https://archive.org/details/example', match: 'exact' }] });
    throw new Error(`Unexpected provider request: ${url}`);
  };
  const server = createApp().listen(0);
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const search = await originalFetch(`${base}/api/catalogue/books?q=example&page=1&pageSize=12`);
    assert.equal(search.status, 200);
    const result = await search.json();
    assert.equal(result.books[0].id, 'works/OL123W');
    assert.equal(result.books[0].price, null);
    assert.equal(result.pagination.totalItems, 1);

    const details = await originalFetch(`${base}/api/catalogue/books/works%2FOL123W`);
    assert.equal(details.status, 200);
    const { book } = await details.json();
    assert.equal(book.description, 'A provider supplied description.');
    assert.equal(book.reading.status, 'full access');
    assert.deepEqual(book.publishers, ['Example Press']);
    assert.deepEqual(book.isbns, ['123456789X']);
    assert.equal(book.sourceUrl, 'https://openlibrary.org/works/OL123W');
    assert.ok(calls.some(url => url.hostname === 'openlibrary.org' && url.pathname === '/search.json'));
  } finally {
    server.close();
    globalThis.fetch = originalFetch;
  }
});

test('book detail preserves restricted reader status and rejects non-provider reader hosts', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/works/OL456W.json') return Response.json({ title: 'Restricted Work' });
    if (url.pathname === '/search.json') return Response.json({ docs: [{ key: '/works/OL456W', title: 'Restricted Work', isbn: ['9781234567890'] }] });
    if (url.pathname.startsWith('/api/volumes/brief/')) return Response.json({ items: [{ status: 'restricted', itemURL: 'https://reader.invalid/book', match: 'exact' }] });
    throw new Error(`Unexpected provider request: ${url}`);
  };
  const server = createApp().listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/catalogue/books/works%2FOL456W`;
    const response = await originalFetch(url);
    assert.equal(response.status, 200);
    const { book } = await response.json();
    assert.equal(book.reading.status, 'restricted');
    assert.equal(book.reading.url, null);
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

test('Google Books fallback normalizes discovery data and maps exact ISBNs to real local inventory', async () => {
  const originalFetch = globalThis.fetch;
  const providerCalls = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    providerCalls.push(url);
    if (url.hostname === 'openlibrary.org') return new Response('temporarily unavailable', { status: 503 });
    if (url.hostname === 'www.googleapis.com' && url.pathname === '/books/v1/volumes') {
      return Response.json({ totalItems: 4, items: [
        { id: 'manga-volume-1', volumeInfo: { title: 'A Manga Volume', authors: ['A. Artist'], categories: ['Comics & Graphic Novels / Manga'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '978-1-234567-89-0' }], imageLinks: { thumbnail: 'http://books.google.com/books/content?id=volume-1&img=1' }, publishedDate: '2024-03', pageCount: 192, previewLink: 'http://books.google.com/books?id=volume-1', infoLink: 'https://books.google.com/books?id=volume-1' }, saleInfo: { listPrice: { amount: 9999, currencyCode: 'INR' } } },
        { id: 'duplicate-volume', volumeInfo: { title: 'Another Listing of the Manga', authors: ['A. Artist'], categories: ['Manga'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781234567890' }] } },
        { id: 'comic-volume', volumeInfo: { title: 'A Comic That Is Not Manga', categories: ['Comics & Graphic Novels / Superheroes'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781111111111' }] } },
        { id: 'no-cover-volume', volumeInfo: { title: 'A No-Cover Manga Book', categories: ['Manga'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9782222222222' }] } },
      ] });
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname === '/books/v1/volumes/manga-volume-1') {
      return Response.json({ id: 'manga-volume-1', volumeInfo: { title: 'A Manga Volume', authors: ['A. Artist'], categories: ['Comics & Graphic Novels / Manga'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781234567890' }], imageLinks: { thumbnail: 'https://books.google.com/books/content?id=volume-1&img=1', extraLarge: 'https://books.google.com/books/content?id=volume-1&zoom=2' }, description: 'Provider description.', publisher: 'Manga Press', publishedDate: '2024-03', pageCount: 192, previewLink: 'https://books.google.com/books?id=volume-1', infoLink: 'https://books.google.com/books?id=volume-1' } });
    }
    throw new Error(`Unexpected provider request: ${url}`);
  };
  const pool = { async query(sql) {
    if (sql.includes('WHERE b.is_active = 1 AND b.isbn IN (?)')) return [[{ id: 41, isbn: '9781234567890', price: 245.5, is_active: 1, quantity: 2 }]];
    if (sql.includes('WHERE b.is_active = 1 AND b.isbn = ?')) return [[{ id: 41, isbn: '9781234567890', title: 'Local Store Title', author: 'Local Author', price: 245.5, description: 'Local description.', cover_image_url: 'https://images.example.test/local-cover.jpg', is_active: 1, quantity: 2 }]];
    throw new Error(`Unexpected inventory query: ${sql}`);
  } };
  const server = createApp({ pool, env: { NODE_ENV: 'test', GOOGLE_BOOKS_API_KEY: 'test-key' } }).listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const search = await originalFetch(`${base}/api/catalogue/books?category=18&page=1&pageSize=12`);
    assert.equal(search.status, 200);
    const result = await search.json();
    assert.equal(result.source, 'googlebooks');
    assert.equal(result.books.length, 2, 'duplicate ISBN listings collapse and unrelated comic categories are excluded');
    assert.equal(result.books[0].id, 'volumes/manga-volume-1');
    assert.equal(result.books[0].category, 'Anime & Manga');
    assert.equal(result.books[0].coverImageUrl.startsWith('https://'), true);
    assert.equal(result.books[0].storeProduct.id, 41, 'the cart identity is the local numeric books.id');
    assert.equal(result.books[0].price, 245.5, 'the store price is authoritative, not Google saleInfo');
    assert.equal(result.books[0].stockStatus, 'low_stock');
    assert.equal(result.books[0].available, true);
    assert.equal(result.books.find(book => book.title === 'A No-Cover Manga Book').coverImageUrl, null, 'missing covers stay missing instead of being misrepresented');

    const detailsResponse = await originalFetch(`${base}/api/catalogue/books/volumes%2Fmanga-volume-1`);
    assert.equal(detailsResponse.status, 200);
    const { book } = await detailsResponse.json();
    assert.equal(book.provider, 'googlebooks');
    assert.equal(book.description, 'Provider description.');
    assert.match(book.coverImageUrl, /zoom=2/);
    assert.equal(book.pageCount, 192);
    assert.equal(book.inventoryDetails.id, 41);
    assert.equal(book.inventoryDetails.description, 'Local description.');
    assert.ok(providerCalls.filter(url => url.hostname === 'openlibrary.org').length === 2, 'Open Library is retried once before fallback');
    assert.ok(providerCalls.some(url => url.hostname === 'www.googleapis.com' && url.searchParams.get('key') === 'test-key'));
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

test('provider failure without a Google Books key returns an actionable retry error', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('down', { status: 503 }); };
  const server = createApp({ env: { NODE_ENV: 'test' } }).listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/catalogue/books?q=retry-check`);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error.message, /GOOGLE_BOOKS_API_KEY/);
    assert.equal(calls, 2, 'one transient retry is attempted');
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

test('external discovery remains populated with an empty local inventory and respects search/category inputs', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    seen.push(url);
    return Response.json({ numFound: 1, docs: [{ key: '/works/OL777W', title: 'Harry Potter Companion', author_name: ['A. Writer'], isbn: ['9781234567890'], cover_i: 77, subject: ['Fantasy', 'Manga'] }] });
  };
  const server = createApp({ pool: { async query() { return [[]]; } } }).listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/catalogue/books?q=Harry%20Potter&category=18&page=1&pageSize=12`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.books.length, 1);
    assert.equal(result.books[0].title, 'Harry Potter Companion');
    assert.equal(result.books[0].coverImageUrl, 'https://covers.openlibrary.org/b/id/77-M.jpg?default=false');
    assert.equal(result.books[0].storeProduct, null);
    assert.equal(result.books[0].price, null);
    assert.equal(result.pagination.totalItems, 1);
    assert.match(seen[0].searchParams.get('q'), /Harry Potter/);
    assert.match(seen[0].searchParams.get('q'), /subject:manga/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

test('an unfiltered catalogue request uses a broad Open Library discovery query', async () => {
  const originalFetch = globalThis.fetch;
  let providerQuery;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    providerQuery = url.searchParams.get('q');
    return Response.json({ numFound: 1, docs: [{ key: '/works/OL888W', title: 'A Fiction Book', author_name: ['A. Author'], subject: ['Fiction'], cover_i: 88 }] });
  };
  const server = createApp({ env: { NODE_ENV: 'test' } }).listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/catalogue/books?page=1&pageSize=12`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(providerQuery, 'subject:fiction');
    assert.equal(result.source, 'openlibrary');
    assert.equal(result.books[0].title, 'A Fiction Book');
    assert.equal(result.books[0].coverImageUrl, 'https://covers.openlibrary.org/b/id/88-M.jpg?default=false');
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

test('provider failures are categorized without exposing Google credentials', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'openlibrary.org') return new Response('down', { status: 503 });
    return Response.json({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'API key not valid: secret' } }, { status: 403 });
  };
  const server = createApp({ env: { NODE_ENV: 'test', GOOGLE_BOOKS_API_KEY: 'must-not-leak' } }).listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/catalogue/books?q=error-case`);
    const body = await response.text();
    assert.equal(response.status, 502);
    assert.match(body, /GOOGLE_BOOKS_PERMISSION_DENIED/);
    assert.doesNotMatch(body, /must-not-leak|API key not valid/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

test('malformed Open Library responses activate the configured Google Books fallback', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'openlibrary.org') return Response.json({ unexpected: [] });
    return Response.json({ totalItems: 1, items: [{ id: 'valid-google-volume', volumeInfo: { title: 'Fallback title', authors: ['Fallback author'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781234567890' }], imageLinks: { thumbnail: 'https://books.google.com/books/content?id=cover' } } }] });
  };
  const server = createApp({ env: { NODE_ENV: 'test', GOOGLE_BOOKS_API_KEY: 'test-key' } }).listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/catalogue/books?q=fallback`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.source, 'googlebooks');
    assert.equal(result.books[0].title, 'Fallback title');
    assert.equal(result.books[0].coverImageUrl, 'https://books.google.com/books/content?id=cover');
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});
