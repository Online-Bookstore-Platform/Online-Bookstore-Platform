// The catalogue's state lives in the page URL (?q=...&category=...), so a
// search can be bookmarked, shared and survives the browser's Back button.

import { PAGE_SIZE } from '../config.js';

export const SORT_OPTIONS = [
  { value: 'title-asc', label: 'Title, A to Z', sort: 'title', order: 'asc' },
  { value: 'title-desc', label: 'Title, Z to A', sort: 'title', order: 'desc' },
  { value: 'author-asc', label: 'Author, A to Z', sort: 'author', order: 'asc' },
  { value: 'price-asc', label: 'Price, low to high', sort: 'price', order: 'asc' },
  { value: 'price-desc', label: 'Price, high to low', sort: 'price', order: 'desc' },
  { value: 'newest-desc', label: 'Newest first', sort: 'newest', order: 'desc' },
];

export const AVAILABILITY_OPTIONS = [
  { value: 'all', label: 'All books' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
];

export const DEFAULT_SORT = 'title-asc';

const isOneOf = (options, value) => options.some((o) => o.value === value);
const positiveInt = (value, fallback) => (/^[1-9]\d{0,8}$/.test(value ?? '') ? Number(value) : fallback);
const priceText = (value) => (/^\d+(\.\d{1,2})?$/.test(value ?? '') ? value : '');

/** URLSearchParams -> a clean, validated catalogue state. */
export function readCatalogueState(params) {
  const categories = (params.get('category') ?? '')
    .split(',')
    .filter((id) => /^[1-9]\d{0,9}$/.test(id));

  const sort = params.get('sort');
  const availability = params.get('availability');

  return {
    q: (params.get('q') ?? '').trim(),
    categories: [...new Set(categories)],
    author: (params.get('author') ?? '').trim(),
    minPrice: priceText(params.get('minPrice')),
    maxPrice: priceText(params.get('maxPrice')),
    availability: isOneOf(AVAILABILITY_OPTIONS, availability) ? availability : 'all',
    sort: isOneOf(SORT_OPTIONS, sort) ? sort : DEFAULT_SORT,
    page: positiveInt(params.get('page'), 1),
  };
}

/** Catalogue state -> URLSearchParams, leaving out everything that is at its default. */
export function toSearchParams(state) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.categories.length > 0) params.set('category', state.categories.join(','));
  if (state.author) params.set('author', state.author);
  if (state.minPrice) params.set('minPrice', state.minPrice);
  if (state.maxPrice) params.set('maxPrice', state.maxPrice);
  if (state.availability !== 'all') params.set('availability', state.availability);
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

/** Catalogue state -> query string for GET /api/books. */
export function toApiQuery(state) {
  const { sort, order } = SORT_OPTIONS.find((o) => o.value === state.sort) ?? SORT_OPTIONS[0];
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.categories.length > 0) params.set('category', state.categories.join(','));
  if (state.author) params.set('author', state.author);
  if (state.minPrice) params.set('minPrice', state.minPrice);
  if (state.maxPrice) params.set('maxPrice', state.maxPrice);
  if (state.availability !== 'all') params.set('availability', state.availability);
  params.set('sort', sort);
  params.set('order', order);
  params.set('page', String(state.page));
  params.set('pageSize', String(PAGE_SIZE));
  return params.toString();
}

/** How many filters (not counting the search text or sort) are switched on. */
export function countActiveFilters(state) {
  return (
    (state.categories.length > 0 ? 1 : 0) +
    (state.author ? 1 : 0) +
    (state.minPrice || state.maxPrice ? 1 : 0) +
    (state.availability !== 'all' ? 1 : 0)
  );
}

/** The same state with all filters cleared (search text and sort are kept). */
export function clearFilters(state) {
  return { ...state, categories: [], author: '', minPrice: '', maxPrice: '', availability: 'all', page: 1 };
}

/** Page numbers to show in the pager: first, last, and a window around the current page. */
export function pageWindow(current, total, radius = 1) {
  const pages = new Set([1, total, current]);
  for (let i = 1; i <= radius; i++) {
    pages.add(current - i);
    pages.add(current + i);
  }
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) out.push('gap');
    out.push(page);
  });
  return out;
}
