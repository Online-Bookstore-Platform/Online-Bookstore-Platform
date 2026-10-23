import { useEffect, useState } from 'react';
import { AVAILABILITY_OPTIONS, priceInputProblem, priceRangeProblem } from './catalogueParams.js';
import { formatPrice } from '../shared/format.js';
import styles from './Catalogue.module.css';

/**
 * Category, price and availability filters. Categories and availability apply as soon as
 * they are chosen; the price range applies with its button so half-typed numbers do not
 * trigger searches.
 */
export default function FilterPanel({ id, open, options, state, onToggleCategory, onAvailability, onApplyPrice, onClear, canClear }) {
  const [minDraft, setMinDraft] = useState(state.minPrice);
  const [maxDraft, setMaxDraft] = useState(state.maxPrice);
  const [problem, setProblem] = useState('');

  // Keep the boxes in step when the address changes (back button, removing a chip, ...).
  useEffect(() => {
    setMinDraft(state.minPrice);
    setMaxDraft(state.maxPrice);
    setProblem('');
  }, [state.minPrice, state.maxPrice]);

  function applyPrice(event) {
    event.preventDefault();
    const min = minDraft.trim();
    const max = maxDraft.trim();
    const message = priceInputProblem(min, 'Minimum price') || priceInputProblem(max, 'Maximum price') || priceRangeProblem(min, max);
    setProblem(message);
    if (!message) onApplyPrice({ minPrice: min, maxPrice: max });
  }

  const { categories, priceRange } = options;
  return (
    <aside className={styles.filters} id={id} data-open={open} aria-label="Filter the catalogue">
      <fieldset className={styles.group}>
        <legend>Category</legend>
        {options.status === 'loading' && <p className={styles.hint}>Loading categories…</p>}
        {options.status === 'error' && <p className={styles.hint}>Categories couldn’t be loaded. You can still search and sort.</p>}
        {categories.map(category => (
          <label className={styles.check} key={category.id}>
            <input type="checkbox" checked={state.categories.includes(category.id)} onChange={() => onToggleCategory(category.id)} />
            <span>{category.name}</span>
            <small>{category.bookCount}</small>
          </label>
        ))}
      </fieldset>

      <form className={styles.group} onSubmit={applyPrice} noValidate>
        <fieldset>
          <legend>Price (₹)</legend>
          <div className={styles.priceFields}>
            <label>
              <span className="visually-hidden">Minimum price</span>
              <input inputMode="decimal" autoComplete="off" placeholder={priceRange ? `Min ${Math.floor(priceRange.min)}` : 'Min'} value={minDraft} onChange={event => setMinDraft(event.target.value)} aria-invalid={Boolean(problem)} aria-describedby={problem ? `${id}-price-problem` : undefined} />
            </label>
            <span aria-hidden="true">to</span>
            <label>
              <span className="visually-hidden">Maximum price</span>
              <input inputMode="decimal" autoComplete="off" placeholder={priceRange ? `Max ${Math.ceil(priceRange.max)}` : 'Max'} value={maxDraft} onChange={event => setMaxDraft(event.target.value)} aria-invalid={Boolean(problem)} aria-describedby={problem ? `${id}-price-problem` : undefined} />
            </label>
          </div>
          {priceRange && priceRange.max > 0 && <p className={styles.hint}>Our books cost {formatPrice(priceRange.min)} to {formatPrice(priceRange.max)}.</p>}
          {problem && <p className={styles.fieldError} id={`${id}-price-problem`} role="alert">{problem}</p>}
          <button className={styles.secondary} type="submit">Apply price</button>
        </fieldset>
      </form>

      <fieldset className={styles.group}>
        <legend>Availability</legend>
        {AVAILABILITY_OPTIONS.map(option => (
          <label className={styles.check} key={option.value}>
            <input type="radio" name="availability" value={option.value} checked={state.availability === option.value} onChange={() => onAvailability(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <button className={styles.clear} type="button" onClick={onClear} disabled={!canClear}>Clear all filters</button>
    </aside>
  );
}
