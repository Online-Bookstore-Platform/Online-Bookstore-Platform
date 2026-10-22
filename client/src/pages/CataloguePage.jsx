import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BookCard from '../components/BookCard.jsx';
import ErrorState from '../components/ErrorState.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import Pagination from '../components/Pagination.jsx';
import { useApi } from '../hooks/useApi.js';
import {
  SORT_OPTIONS,
  clearFilters,
  countActiveFilters,
  readCatalogueState,
  toApiQuery,
  toSearchParams,
} from '../utils/catalogueParams.js';
import { pluralise } from '../utils/format.js';
import { PAGE_SIZE } from '../config.js';

export default function CataloguePage() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readCatalogueState(params), [params]);
  const activeCount = countActiveFilters(state);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const books = useApi(`/books?${toApiQuery(state)}`);
  const filterOptions = useApi('/books/filters');

  // Changing anything except the page goes back to page 1.
  function update(changes) {
    setParams(toSearchParams({ ...state, page: 1, ...changes }));
  }
  const searchFor = (page) => `?${toSearchParams({ ...state, page })}`;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.page]);

  const result = books.data;
  const items = result?.data ?? [];
  const pagination = result?.pagination;
  const firstLoad = !result && books.status === 'loading';
  const noMatches = result && items.length === 0 && books.status !== 'error';

  let summary = '';
  if (pagination) {
    if (pagination.totalItems === 0) summary = state.q ? `No books for “${state.q}”` : 'No books found';
    else {
      const first = (pagination.page - 1) * PAGE_SIZE + 1;
      const last = first + items.length - 1;
      summary =
        pagination.totalItems > items.length
          ? `Showing ${first}–${last} of ${pluralise(pagination.totalItems, 'book')}`
          : pluralise(pagination.totalItems, 'book');
      if (state.q) summary += ` for “${state.q}”`;
    }
  }

  return (
    <main className="catalogue">
      <div className="catalogue__heading">
        <h1 className="page-title">Books</h1>
        <p className="results__count" role="status">
          {summary}
        </p>
      </div>

      <aside className="catalogue__filters" aria-label="Filters">
        <button
          type="button"
          className="btn btn--outline filters-toggle"
          aria-expanded={filtersOpen}
          aria-controls="filters-body"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {filtersOpen ? 'Hide filters' : activeCount > 0 ? `Filters (${activeCount} on)` : 'Filters'}
        </button>
        <div id="filters-body" className={`filters-body${filtersOpen ? ' filters-body--open' : ''}`}>
          <FilterPanel
            options={filterOptions.data?.data ?? null}
            state={state}
            activeCount={activeCount}
            onChange={update}
            onClear={() => setParams(toSearchParams(clearFilters(state)))}
          />
        </div>
      </aside>

      <section className="catalogue__results" aria-busy={books.status === 'loading'}>
        <div className="results__bar">
          <label className="results__sort">
            <span>Sort by</span>
            <select className="field" value={state.sort} onChange={(event) => update({ sort: event.target.value })}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {books.status === 'error' && !result && (
          <ErrorState title="We could not load the books" message={books.error.message} onRetry={books.reload} />
        )}

        {books.status === 'error' && result && (
          <ErrorState title="Results may be out of date" message={books.error.message} onRetry={books.reload} />
        )}

        {firstLoad && (
          <ul className="book-grid book-grid--loading" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="book-skeleton" />
            ))}
          </ul>
        )}

        {noMatches && (
          <div className="state">
            <h2 className="state__title">No books match what you searched for</h2>
            <p className="state__text">Check the spelling, try fewer words, or remove some filters.</p>
            <div className="state__actions">
              {activeCount > 0 && (
                <button type="button" className="btn" onClick={() => setParams(toSearchParams(clearFilters(state)))}>
                  Clear filters
                </button>
              )}
              {state.q && (
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setParams(toSearchParams({ ...state, q: '', page: 1 }))}
                >
                  Clear search
                </button>
              )}
            </div>
          </div>
        )}

        {items.length > 0 && (
          <ul className={`book-grid${books.status === 'loading' ? ' book-grid--stale' : ''}`}>
            {items.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </ul>
        )}

        {pagination && <Pagination page={pagination.page} totalPages={pagination.totalPages} searchFor={searchFor} />}
      </section>
    </main>
  );
}
