import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearFilters,
  countActiveFilters,
  pageWindow,
  readCatalogueState,
  toApiQuery,
  toSearchParams,
} from './catalogueParams.js';

const read = (query) => readCatalogueState(new URLSearchParams(query));

test('an empty URL gives the default state', () => {
  assert.deepEqual(read(''), {
    q: '',
    categories: [],
    author: '',
    minPrice: '',
    maxPrice: '',
    availability: 'all',
    sort: 'title-asc',
    page: 1,
  });
});

test('reads every setting from the URL', () => {
  const state = read('q=austen&category=1,3&author=Jane+Austen&minPrice=100&maxPrice=300.5&availability=in_stock&sort=price-desc&page=4');
  assert.deepEqual(state, {
    q: 'austen',
    categories: ['1', '3'],
    author: 'Jane Austen',
    minPrice: '100',
    maxPrice: '300.5',
    availability: 'in_stock',
    sort: 'price-desc',
    page: 4,
  });
});

test('ignores invalid values instead of passing them on', () => {
  const state = read('category=abc,2,2&minPrice=free&maxPrice=-4&availability=maybe&sort=rating&page=0');
  assert.deepEqual(state.categories, ['2']);
  assert.equal(state.minPrice, '');
  assert.equal(state.maxPrice, '');
  assert.equal(state.availability, 'all');
  assert.equal(state.sort, 'title-asc');
  assert.equal(state.page, 1);
});

test('writing the URL leaves out everything that is at its default', () => {
  assert.equal(toSearchParams(read('')).toString(), '');
  assert.equal(toSearchParams(read('sort=title-asc&page=1&availability=all')).toString(), '');
  const url = 'q=dracula&category=5&availability=in_stock&sort=price-asc&page=2';
  assert.equal(toSearchParams(read(url)).toString(), url);
});

test('builds the API query with sort and order split apart', () => {
  const query = new URLSearchParams(toApiQuery(read('q=austen&sort=price-desc&page=2')));
  assert.equal(query.get('q'), 'austen');
  assert.equal(query.get('sort'), 'price');
  assert.equal(query.get('order'), 'desc');
  assert.equal(query.get('page'), '2');
  assert.equal(query.get('pageSize'), '12');
  assert.equal(query.has('category'), false);
});

test('counts the filters that are switched on (price counts once)', () => {
  assert.equal(countActiveFilters(read('q=x&sort=price-asc')), 0);
  assert.equal(countActiveFilters(read('category=1,2&author=A&minPrice=1&maxPrice=9&availability=in_stock')), 4);
});

test('clearing filters keeps the search text and sort order', () => {
  const cleared = clearFilters(read('q=dracula&category=5&minPrice=100&sort=price-asc&page=3'));
  assert.equal(cleared.q, 'dracula');
  assert.equal(cleared.sort, 'price-asc');
  assert.equal(countActiveFilters(cleared), 0);
  assert.equal(cleared.page, 1);
});

test('pager shows the first and last page with a window around the current one', () => {
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(1, 10), [1, 2, 'gap', 10]);
  assert.deepEqual(pageWindow(5, 10), [1, 'gap', 4, 5, 6, 'gap', 10]);
  assert.deepEqual(pageWindow(10, 10), [1, 'gap', 9, 10]);
  assert.deepEqual(pageWindow(2, 4), [1, 2, 3, 4]);
});
