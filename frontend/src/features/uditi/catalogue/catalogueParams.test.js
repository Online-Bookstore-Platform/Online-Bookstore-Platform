import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STATE,
  activeFilterChips,
  clearFilters,
  hasActiveFilters,
  pageWindow,
  paletteFor,
  parseSearchParams,
  priceInputProblem,
  priceRangeProblem,
  removeFilter,
  resultRange,
  toApiParams,
  toSearchParams,
} from './catalogueParams.js';

const parse = query => parseSearchParams(new URLSearchParams(query));

describe('parseSearchParams', () => {
  it('gives the defaults for an empty address', () => {
    assert.deepEqual(parse(''), DEFAULT_STATE);
  });

  it('reads every control', () => {
    assert.deepEqual(parse('q=%20austen%20&category=3,1,3&minPrice=100&maxPrice=349.50&availability=in_stock&sort=price-desc&page=4'), {
      q: 'austen',
      categories: [3, 1],
      minPrice: '100',
      maxPrice: '349.50',
      availability: 'in_stock',
      sortKey: 'price-desc',
      page: 4,
    });
  });

  it('ignores anything invalid instead of failing', () => {
    assert.deepEqual(parse('category=abc,0,-2,1e3&minPrice=abc&maxPrice=-5&availability=maybe&sort=rating&page=0'), DEFAULT_STATE);
    assert.equal(parse('page=1.5').page, 1);
    assert.equal(parse('page=99999999').page, 1);
    assert.equal(parse(`q=${'x'.repeat(300)}`).q.length, 100);
    assert.equal(parse('maxPrice=1e5').maxPrice, '');
    assert.equal(parse('minPrice=12.345').minPrice, '');
  });

  it('caps the number of categories', () => {
    const many = Array.from({ length: 40 }, (_, i) => i + 1).join(',');
    assert.equal(parse(`category=${many}`).categories.length, 20);
  });
});

describe('toSearchParams (browser URL)', () => {
  it('leaves defaults out and round-trips everything else', () => {
    assert.equal(toSearchParams(DEFAULT_STATE).toString(), '');
    const state = { q: 'jane eyre', categories: [2, 5], minPrice: '100', maxPrice: '300', availability: 'out_of_stock', sortKey: 'newest-desc', page: 3 };
    assert.deepEqual(parseSearchParams(toSearchParams(state)), state);
  });
});

describe('toApiParams (backend query)', () => {
  it('always sends sorting and paging, and only the filters that are set', () => {
    assert.equal(toApiParams(DEFAULT_STATE).toString(), 'sort=title&order=asc&page=1&pageSize=12');
  });

  it('splits the sort option into sort + order', () => {
    const params = toApiParams({ ...DEFAULT_STATE, sortKey: 'price-desc', q: 'austen', categories: [1, 2], minPrice: '50', maxPrice: '400', availability: 'in_stock', page: 2 });
    assert.deepEqual(Object.fromEntries(params), {
      q: 'austen',
      category: '1,2',
      minPrice: '50',
      maxPrice: '400',
      availability: 'in_stock',
      sort: 'price',
      order: 'desc',
      page: '2',
      pageSize: '12',
    });
  });

  it('percent-encodes search text that looks like query syntax', () => {
    const query = toApiParams({ ...DEFAULT_STATE, q: 'a&b=c#d' }).toString();
    assert.ok(query.includes('q=a%26b%3Dc%23d'));
  });
});

describe('price input checks', () => {
  it('accepts blank and plain decimals only', () => {
    for (const ok of ['', ' ', '0', '150', '149.99']) assert.equal(priceInputProblem(ok, 'Minimum price'), '', ok);
    for (const bad of ['abc', '-5', '1e3', '12.345', '₹100', '1,000']) assert.match(priceInputProblem(bad, 'Minimum price'), /Minimum price must be a number/, bad);
  });

  it('flags an inverted range', () => {
    assert.match(priceRangeProblem('500', '100'), /cannot be higher/);
    assert.equal(priceRangeProblem('100', '100'), '');
    assert.equal(priceRangeProblem('', '100'), '');
    assert.equal(priceRangeProblem('100', ''), '');
  });
});

describe('filter chips', () => {
  const names = new Map([[1, 'Classics'], [3, 'Mystery']]);
  const state = { ...DEFAULT_STATE, q: 'jane', categories: [1, 3], minPrice: '100', maxPrice: '300', availability: 'in_stock' };

  it('describes each active filter', () => {
    assert.deepEqual(activeFilterChips(state, names).map(chip => chip.label), ['“jane”', 'Classics', 'Mystery', '₹100 to ₹300', 'In stock']);
    assert.deepEqual(activeFilterChips({ ...DEFAULT_STATE, maxPrice: '200' }).map(chip => chip.label), ['Up to ₹200']);
    assert.deepEqual(activeFilterChips({ ...DEFAULT_STATE, minPrice: '200' }).map(chip => chip.label), ['From ₹200']);
    assert.deepEqual(activeFilterChips(DEFAULT_STATE), []);
  });

  it('copes with a category whose name is not known yet', () => {
    assert.equal(activeFilterChips({ ...DEFAULT_STATE, categories: [9] }, new Map())[0].label, 'Category');
  });

  it('removes exactly one filter and returns to page 1', () => {
    const paged = { ...state, page: 4 };
    assert.deepEqual(removeFilter(paged, 'q'), { ...paged, q: '', page: 1 });
    assert.deepEqual(removeFilter(paged, 'category:1').categories, [3]);
    assert.deepEqual(removeFilter(paged, 'price'), { ...paged, minPrice: '', maxPrice: '', page: 1 });
    assert.equal(removeFilter(paged, 'availability').availability, 'all');
  });

  it('clearing keeps the chosen sort order', () => {
    assert.deepEqual(clearFilters({ ...state, sortKey: 'price-asc', page: 3 }), { ...DEFAULT_STATE, sortKey: 'price-asc' });
    assert.equal(hasActiveFilters(state), true);
    assert.equal(hasActiveFilters({ ...DEFAULT_STATE, sortKey: 'price-asc', page: 5 }), false);
  });
});

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    assert.deepEqual(pageWindow(1, 1), [1]);
    assert.deepEqual(pageWindow(1, 0), []);
    assert.deepEqual(pageWindow(2, 5), [1, 2, 3, 4, 5]);
  });

  it('collapses long runs into a gap but never hides a single page', () => {
    assert.deepEqual(pageWindow(1, 20), [1, 2, 'gap', 20]);
    assert.deepEqual(pageWindow(6, 20), [1, 'gap', 5, 6, 7, 'gap', 20]);
    assert.deepEqual(pageWindow(4, 20), [1, 2, 3, 4, 5, 'gap', 20]);
    assert.deepEqual(pageWindow(20, 20), [1, 'gap', 19, 20]);
  });
});

describe('result summary and covers', () => {
  it('summarises the visible range', () => {
    assert.equal(resultRange({ page: 1, pageSize: 12, totalItems: 25 }), 'Showing 1–12 of 25 books');
    assert.equal(resultRange({ page: 3, pageSize: 12, totalItems: 25 }), 'Showing 25–25 of 25 books');
    assert.equal(resultRange({ page: 1, pageSize: 12, totalItems: 1 }), 'Showing 1–1 of 1 book');
    assert.equal(resultRange({ page: 1, pageSize: 12, totalItems: 0 }), 'No books');
  });

  it('picks one of the existing cover palettes per category', () => {
    for (const id of [1, 2, 3, 4, 5, 6, 7, 99]) assert.ok(['sage', 'clay', 'ink', 'plum', 'ochre'].includes(paletteFor(id)));
    assert.equal(paletteFor(2), paletteFor(2));
    assert.ok(['sage', 'clay', 'ink', 'plum', 'ochre'].includes(paletteFor(undefined)));
  });
});
