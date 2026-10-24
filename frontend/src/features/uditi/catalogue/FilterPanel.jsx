import styles from './Catalogue.module.css';

export default function FilterPanel({ id, open, options, state, onToggleCategory, onClear, canClear }) {
  return <aside className={styles.filters} id={id} data-open={open} aria-label="Filter the catalogue">
    <fieldset className={styles.group}>
      <legend>Category</legend>
      {options.status === 'loading' && <p className={styles.hint}>Loading categories…</p>}
      {options.status === 'error' && <p className={styles.hint}>Categories couldn’t be loaded. You can still search and sort.</p>}
      {options.categories.map(category => <label className={styles.check} key={category.id}>
        <input type="checkbox" checked={state.categories.includes(category.id)} onChange={() => onToggleCategory(category.id)} />
        <span>{category.name}</span>
      </label>)}
    </fieldset>
    <p className={styles.hint}>Retail prices and store stock are not provided by Open Library.</p>
    <button className={styles.clear} type="button" onClick={onClear} disabled={!canClear}>Clear all filters</button>
  </aside>;
}
