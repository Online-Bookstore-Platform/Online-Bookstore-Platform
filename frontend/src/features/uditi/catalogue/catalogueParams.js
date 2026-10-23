/*
 * The catalogue page keeps ALL of its state in the address bar
 * (/catalogue?q=austen&category=1,3&sort=price-asc&page=2), so a search can be
 * bookmarked, shared and survives the back button. These pure functions convert between
 *   - the browser URL        (parseSearchParams / toSearchParams)
 *   - the page's state       ({ q, categories, minPrice, maxPrice, availability, sortKey, page })
 *   - the backend query      (toApiParams -> GET /api/catalogue/books)
 * Anything invalid in the URL falls back to the default instead of breaking the page.
 */

export const PAGE_SIZE = 12;
export const AVAILABILITY_OPTIONS = [
  { value: 'all', label: 'All books' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
];
export const SORT_OPTIONS = [
  { key: 'title-asc', label: 'Title, A to Z', sort: 'title', order: 'asc' },
  { key: 'title-desc', label: 'Title, Z to A', sort: 'title', order: 'desc' },
  { key: 'author-asc', label: 'Author, A to Z', sort: 'author', order: 'asc' },
  { key: 'price-asc', label: 'Price, low to high', sort: 'price', order: 'asc' },
  { key: 'price-desc', label: 'Price, high to low', sort: 'price', order: 'desc' },
  { key: 'newest-desc', label: 'Newest first', sort: 'newest', order: 'desc' },
];

export const DEFAULT_STATE = Object.freeze({ q: '', categories: [], minPrice: '', maxPrice: '', availability: 'all', sortKey: 'title-asc', page: 1 });

const MAX_QUERY_LENGTH = 100;
const MAX_CATEGORIES = 20;
const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;

const validPrice = value => (PRICE_PATTERN.test(value ?? '') && Number(value) <= 99999999.99 ? value : '');

export function parseSearchParams(params) {
  const categories = [];
  for (const part of (params.get('category') ?? '').split(',')) {
    const id = /^[1-9]\d{0,9}$/.test(part.trim()) ? Number(part.trim()) : null;
    if (id !== null && !categories.includes(id) && categories.length < MAX_CATEGORIES) categories.push(id);
  }

  const availability = params.get('availability');
  const sortKey = params.get('sort');
  const page = /^[1-9]\d{0,5}$/.test(params.get('page') ?? '') ? Number(params.get('page')) : 1;

  return {
    q: (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH),
    categories,
    minPrice: validPrice(params.get('minPrice')),
    maxPrice: validPrice(params.get('maxPrice')),
    availability: AVAILABILITY_OPTIONS.some(option => option.value === availability) ? availability : DEFAULT_STATE.availability,
    sortKey: SORT_OPTIONS.some(option => option.key === sortKey) ? sortKey : DEFAULT_STATE.sortKey,
    page,
  };
}

/** State -> the shortest URL query string (defaults are left out). */
export function toSearchParams(state) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.categories.length > 0) params.set('category', state.categories.join(','));
  if (state.minPrice) params.set('minPrice', state.minPrice);
  if (state.maxPrice) params.set('maxPrice', state.maxPrice);
  if (state.availability !== DEFAULT_STATE.availability) params.set('availability', state.availability);
  if (state.sortKey !== DEFAULT_STATE.sortKey) params.set('sort', state.sortKey);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

/** State -> the query string of GET /api/catalogue/books. */
export function toApiParams(state) {
  const { sort, order } = SORT_OPTIONS.find(option => option.key === state.sortKey) ?? SORT_OPTIONS[0];
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.categories.length > 0) params.set('category', state.categories.join(','));
  if (state.minPrice) params.set('minPrice', state.minPrice);
  if (state.maxPrice) params.set('maxPrice', state.maxPrice);
  if (state.availability !== 'all') params.set('availability', state.availability);
  params.set('sort', sort);
  params.set('order', order);
  params.set('page', String(state.page));
  params.set('pageSize', String(PAGE_SIZE));
  return params;
}

/** A message for a price the person typed, or '' when it is fine (or empty). */
export function priceInputProblem(value, label) {
  const text = (value ?? '').trim();
  if (text === '') return '';
  if (!PRICE_PATTERN.test(text) || Number(text) > 99999999.99) return `${label} must be a number such as 150 or 149.99.`;
  return '';
}

/** A message when the minimum is above the maximum, else ''. */
export function priceRangeProblem(minPrice, maxPrice) {
  if (minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice)) return 'The minimum price cannot be higher than the maximum price.';
  return '';
}

/** Does this state differ from "show everything"? (Sorting and paging do not count.) */
export const hasActiveFilters = state => state.q !== '' || state.categories.length > 0 || state.minPrice !== '' || state.maxPrice !== '' || state.availability !== 'all';

/**
 * The removable "chips" shown above the results.
 * @param {Map<number,string>|Record<number,string>} [categoryNames]
 */
export function activeFilterChips(state, categoryNames = new Map(), formatMoney = value => `₹${value}`) {
  const nameOf = id => (categoryNames instanceof Map ? categoryNames.get(id) : categoryNames[id]) ?? 'Category';
  const chips = [];
  if (state.q) chips.push({ id: 'q', label: `“${state.q}”` });
  for (const id of state.categories) chips.push({ id: `category:${id}`, label: nameOf(id) });
  if (state.minPrice || state.maxPrice) {
    const label = state.minPrice && state.maxPrice ? `${formatMoney(state.minPrice)} to ${formatMoney(state.maxPrice)}` : state.minPrice ? `From ${formatMoney(state.minPrice)}` : `Up to ${formatMoney(state.maxPrice)}`;
    chips.push({ id: 'price', label });
  }
  if (state.availability !== 'all') chips.push({ id: 'availability', label: AVAILABILITY_OPTIONS.find(option => option.value === state.availability)?.label ?? state.availability });
  return chips;
}

/** State without the filter a chip stands for (and back on page 1). */
export function removeFilter(state, chipId) {
  const next = { ...state, page: 1 };
  if (chipId === 'q') next.q = '';
  else if (chipId === 'price') Object.assign(next, { minPrice: '', maxPrice: '' });
  else if (chipId === 'availability') next.availability = 'all';
  else if (chipId.startsWith('category:')) next.categories = state.categories.filter(id => `category:${id}` !== chipId);
  return next;
}

export const clearFilters = state => ({ ...DEFAULT_STATE, sortKey: state.sortKey });

/**
 * Page numbers to show: always the first, last and current page with one neighbour on each
 * side; larger jumps become a 'gap' marker. pageWindow(6, 20) -> [1, 'gap', 5, 6, 7, 'gap', 20]
 */
export function pageWindow(page, totalPages) {
  if (totalPages <= 1) return totalPages === 1 ? [1] : [];
  const wanted = new Set([1, totalPages, page - 1, page, page + 1].filter(n => n >= 1 && n <= totalPages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const result = [];
  sorted.forEach((n, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined) {
      if (n - previous === 2) result.push(previous + 1);
      else if (n - previous > 2) result.push('gap');
    }
    result.push(n);
  });
  return result;
}

/** "Showing 13–24 of 25 books" */
export function resultRange({ page, pageSize, totalItems }) {
  if (totalItems === 0) return 'No books';
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(totalItems, page * pageSize);
  return `Showing ${first}–${last} of ${totalItems} ${totalItems === 1 ? 'book' : 'books'}`;
}

/** A calm cover colour per category, from the palettes the shared BookCard already offers. */
const PALETTES = ['sage', 'clay', 'ink', 'plum', 'ochre'];
export const paletteFor = categoryId => PALETTES[Math.abs(Number(categoryId) || 0) % PALETTES.length];
