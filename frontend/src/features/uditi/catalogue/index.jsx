import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Container from '../../../components/shared/Container/Container.jsx';
import { isAbort } from '../shared/api.js';
import { formatPrice } from '../shared/format.js';
import { fetchBooks, fetchFilterOptions } from './api.js';
import {
  SORT_OPTIONS,
  activeFilterChips,
  clearFilters,
  hasActiveFilters,
  parseSearchParams,
  removeFilter,
  resultRange,
  toApiParams,
  toSearchParams,
} from './catalogueParams.js';
import BookResult from './BookResult.jsx';
import FilterPanel from './FilterPanel.jsx';
import Pagination from './Pagination.jsx';
import styles from './Catalogue.module.css';

const LOADING = { status: 'loading', books: [], pagination: null, message: '' };

/**
 * Story #3: browse, search, filter and sort the catalogue. Everything shown comes from
 * GET /api/catalogue/books (external discovery, with local inventory attached when ISBNs match);
 * the page state lives in the address bar.
 */
export default function CataloguePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseSearchParams(searchParams), [searchParams]);
  const apiQuery = useMemo(() => toApiParams(state).toString(), [state]);

  const [result, setResult] = useState(LOADING);
  const [options, setOptions] = useState({ status: 'loading', categories: [], priceRange: null });
  const [reload, setReload] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(state.q);
  const resultsHeading = useRef(null);
  const focusResults = useRef(false);

  const update = useCallback((patch, { replace = false } = {}) => {
    setSearchParams(toSearchParams({ ...state, page: 1, ...patch }), { replace });
  }, [state, setSearchParams]);

  // --- filter options (categories, price range), loaded once -----------------
  useEffect(() => {
    const controller = new AbortController();
    fetchFilterOptions(controller.signal)
      .then(filters => setOptions({ status: 'ready', categories: filters.categories, priceRange: filters.priceRange }))
      .catch(error => { if (!isAbort(error)) setOptions({ status: 'error', categories: [], priceRange: null }); });
    return () => controller.abort();
  }, []);

  // --- the books for the current address -------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    setResult(previous => ({ ...previous, status: 'loading' }));
    fetchBooks(apiQuery, controller.signal)
      .then(body => setResult({ status: 'ready', books: body.books, pagination: body.pagination, message: '' }))
      .catch(error => { if (!isAbort(error)) setResult({ status: 'error', books: [], pagination: null, message: error.message }); });
    return () => controller.abort();
  }, [apiQuery, reload]);

  // A page number past the end (an old link, or filters that narrowed the list): go to the last page.
  useEffect(() => {
    const { status, books, pagination } = result;
    if (status === 'ready' && books.length === 0 && pagination.totalItems > 0 && state.page > pagination.totalPages) {
      update({ page: pagination.totalPages }, { replace: true });
    }
  }, [result, state.page, update]);

  // After paging, move focus to the results so keyboard and screen-reader users land there.
  useEffect(() => {
    if (result.status === 'ready' && focusResults.current) {
      focusResults.current = false;
      resultsHeading.current?.focus();
      resultsHeading.current?.scrollIntoView({ block: 'start' });
    }
  }, [result]);

  useEffect(() => setSearchDraft(state.q), [state.q]);
  useEffect(() => {
    const query = searchDraft.trim();
    if (query === state.q) return undefined;
    const timer = window.setTimeout(() => update({ q: query }), 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, state.q, update]);

  const categoryNames = useMemo(() => new Map(options.categories.map(category => [category.id, category.name])), [options.categories]);
  useEffect(() => {
    const root = document.documentElement;
    const firstSelected = state.categories[0];
    if (firstSelected && categoryNames.has(firstSelected)) root.dataset.category = categoryNames.get(firstSelected);
    else delete root.dataset.category;
    return () => { delete root.dataset.category; };
  }, [categoryNames, state.categories]);
  const chips = activeFilterChips(state, categoryNames, formatPrice);
  const filtered = hasActiveFilters(state);

  function submitSearch(event) {
    event.preventDefault();
    update({ q: searchDraft.trim() });
  }

  function toggleCategory(id) {
    update({ categories: state.categories.includes(id) ? state.categories.filter(item => item !== id) : [...state.categories, id] });
  }

  function goToPage(page) {
    focusResults.current = true;
    update({ page });
  }

  const { status, books, pagination } = result;
  const first = status === 'loading' && books.length === 0;

  let summary = 'Loading books…';
  if (status === 'ready') summary = resultRange(pagination);
  else if (status === 'error') summary = 'Books unavailable';
  else if (pagination) summary = resultRange(pagination);

  return (
    <section className={styles.page}>
      <Container className={styles.wideContainer}>
        <header className={styles.header}>
          <p className="eyebrow">The collection</p>
          <h1>Find something unexpected.</h1>
          <form className={styles.search} role="search" onSubmit={submitSearch}>
            <label className="visually-hidden" htmlFor="catalogue-search">Search by title, author, category or ISBN</label>
            <input id="catalogue-search" type="search" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="Search by title, author, category or ISBN" maxLength={100} autoComplete="off" />
            <button type="submit">Search</button>
          </form>
        </header>

        <div className={styles.layout}>
          <button className={styles.filterToggle} type="button" aria-expanded={filtersOpen} aria-controls="catalogue-filters" onClick={() => setFiltersOpen(open => !open)}>
            Filters{chips.length > 0 ? ` (${chips.length})` : ''}
          </button>
          <FilterPanel
            id="catalogue-filters"
            open={filtersOpen}
            options={options}
            state={state}
            onToggleCategory={toggleCategory}
            onClear={() => setSearchParams(toSearchParams(clearFilters(state)))}
            canClear={filtered}
          />

          <div className={styles.results} aria-busy={status === 'loading'}>
            <h2 className="visually-hidden" tabIndex={-1} ref={resultsHeading}>Search results</h2>
            <div className={styles.toolbar}>
              <p className={styles.count} role="status" aria-live="polite">{summary}</p>
              <label className={styles.sort}>
                <span>Sort by</span>
                <select value={state.sortKey} onChange={event => update({ sortKey: event.target.value })}>
                  {SORT_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </label>
            </div>

            {chips.length > 0 && (
              <ul className={styles.chips} aria-label="Active filters">
                {chips.map(chip => (
                  <li key={chip.id}>
                    <button type="button" onClick={() => setSearchParams(toSearchParams(removeFilter(state, chip.id)))} aria-label={`Remove filter: ${chip.label}`}>
                      {chip.label} <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {first && (
              <div aria-hidden="true">
                <ul className={styles.grid}>
                  {Array.from({ length: 8 }, (_, index) => <li key={index} className={styles.skeleton}><span /><span /><span /></li>)}
                </ul>
              </div>
            )}

            {status === 'error' && (
              <div className={styles.state} role="alert">
                <h2>We couldn’t load the books.</h2>
                <p>{result.message}</p>
                <button type="button" onClick={() => setReload(count => count + 1)}>Try again</button>
              </div>
            )}

            {status === 'ready' && books.length === 0 && pagination.totalItems === 0 && (
              <div className={styles.state} role="status">
                <h2>{filtered ? 'No books match that.' : 'No books found.'}</h2>
                <p>{filtered ? 'Try fewer words, check the spelling, or remove a filter.' : 'The discovery providers returned no matching books. Please try again shortly.'}</p>
                {filtered && <button type="button" onClick={() => setSearchParams(toSearchParams(clearFilters(state)))}>Clear all filters</button>}
              </div>
            )}

            {books.length > 0 && (
              <ul className={`${styles.grid} ${status === 'loading' ? styles.refreshing : ''}`}>
                {books.map((book, index) => <BookResult key={book.id} book={book} index={index} />)}
              </ul>
            )}

            {status === 'ready' && pagination && <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={goToPage} />}
          </div>
        </div>
      </Container>
    </section>
  );
}
