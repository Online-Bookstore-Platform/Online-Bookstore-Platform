import { pageWindow } from './catalogueParams.js';
import styles from './Catalogue.module.css';

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label="Catalogue pages">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <span aria-hidden="true">←</span> Previous
      </button>
      <ol>
        {pageWindow(page, totalPages).map((entry, position) =>
          entry === 'gap' ? (
            <li key={`gap-${position}`} aria-hidden="true" className={styles.gap}>…</li>
          ) : (
            <li key={entry}>
              <button type="button" onClick={() => onChange(entry)} aria-current={entry === page ? 'page' : undefined} aria-label={`Page ${entry}`} data-current={entry === page}>
                {entry}
              </button>
            </li>
          )
        )}
      </ol>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        Next <span aria-hidden="true">→</span>
      </button>
    </nav>
  );
}
