import { useEffect, useState } from 'react';
import { AVAILABILITY_OPTIONS } from '../utils/catalogueParams.js';

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;

function priceProblem(min, max) {
  if ((min && !PRICE_PATTERN.test(min)) || (max && !PRICE_PATTERN.test(max))) {
    return 'Enter prices as numbers, for example 150 or 149.99.';
  }
  if (min && max && Number(min) > Number(max)) {
    return 'The lowest price cannot be higher than the highest price.';
  }
  return '';
}

/**
 * Filter controls. `options` comes from GET /api/books/filters (null while loading);
 * `state` is the current catalogue state; `onChange` receives only what changed.
 */
export default function FilterPanel({ options, state, onChange, onClear, activeCount }) {
  const [min, setMin] = useState(state.minPrice);
  const [max, setMax] = useState(state.maxPrice);

  useEffect(() => setMin(state.minPrice), [state.minPrice]);
  useEffect(() => setMax(state.maxPrice), [state.maxPrice]);

  const problem = priceProblem(min, max);

  function commitPrice() {
    if (problem) return;
    if (min !== state.minPrice || max !== state.maxPrice) onChange({ minPrice: min, maxPrice: max });
  }

  function toggleCategory(id, checked) {
    const key = String(id);
    const categories = checked ? [...state.categories, key] : state.categories.filter((c) => c !== key);
    onChange({ categories });
  }

  const authors = options?.authors ?? [];
  const authorMissing = state.author && !authors.includes(state.author);

  return (
    <div className="filter-panel">
      <div className="filter-panel__head">
        <h2 className="filter-panel__title">Filters</h2>
        {activeCount > 0 && (
          <button type="button" className="link-button" onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>

      <fieldset className="filter-group">
        <legend>Category</legend>
        {options ? (
          options.categories.map((category) => (
            <label key={category.id} className="check">
              <input
                type="checkbox"
                checked={state.categories.includes(String(category.id))}
                onChange={(event) => toggleCategory(category.id, event.target.checked)}
              />
              <span>{category.name}</span>
              <span className="check__count">{category.bookCount}</span>
            </label>
          ))
        ) : (
          <p className="muted">Loading…</p>
        )}
      </fieldset>

      <div className="filter-group">
        <label className="filter-group__label" htmlFor="filter-author">
          Author
        </label>
        <select
          id="filter-author"
          className="field"
          value={state.author}
          onChange={(event) => onChange({ author: event.target.value })}
        >
          <option value="">Any author</option>
          {authorMissing && <option value={state.author}>{state.author}</option>}
          {authors.map((author) => (
            <option key={author} value={author}>
              {author}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="filter-group">
        <legend>Price</legend>
        <div className="price-row">
          <label className="visually-hidden" htmlFor="filter-min-price">
            Lowest price
          </label>
          <input
            id="filter-min-price"
            className="field"
            inputMode="decimal"
            placeholder={options ? String(Math.floor(options.priceRange.min)) : 'Min'}
            value={min}
            aria-invalid={Boolean(problem)}
            aria-describedby={problem ? 'price-problem' : undefined}
            onChange={(event) => setMin(event.target.value.trim())}
            onBlur={commitPrice}
            onKeyDown={(event) => event.key === 'Enter' && commitPrice()}
          />
          <span aria-hidden="true">to</span>
          <label className="visually-hidden" htmlFor="filter-max-price">
            Highest price
          </label>
          <input
            id="filter-max-price"
            className="field"
            inputMode="decimal"
            placeholder={options ? String(Math.ceil(options.priceRange.max)) : 'Max'}
            value={max}
            aria-invalid={Boolean(problem)}
            aria-describedby={problem ? 'price-problem' : undefined}
            onChange={(event) => setMax(event.target.value.trim())}
            onBlur={commitPrice}
            onKeyDown={(event) => event.key === 'Enter' && commitPrice()}
          />
        </div>
        {problem && (
          <p id="price-problem" className="field-error" role="alert">
            {problem}
          </p>
        )}
      </fieldset>

      <fieldset className="filter-group">
        <legend>Availability</legend>
        {AVAILABILITY_OPTIONS.map((option) => (
          <label key={option.value} className="check">
            <input
              type="radio"
              name="availability"
              value={option.value}
              checked={state.availability === option.value}
              onChange={() => onChange({ availability: option.value })}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
