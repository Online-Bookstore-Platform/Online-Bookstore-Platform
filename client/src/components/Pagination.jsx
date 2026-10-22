import { Link } from 'react-router-dom';
import { pageWindow } from '../utils/catalogueParams.js';

/**
 * Page links. `searchFor(page)` returns the "?..." string for that page, so
 * every page number is a real link that can be opened in a new tab.
 */
export default function Pagination({ page, totalPages, searchFor }) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pages of results">
      {page > 1 ? (
        <Link className="pagination__step" to={{ search: searchFor(page - 1) }} rel="prev">
          Previous
        </Link>
      ) : (
        <span className="pagination__step pagination__step--off">Previous</span>
      )}

      <ol className="pagination__pages">
        {pageWindow(page, totalPages).map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${index}`} className="pagination__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                to={{ search: searchFor(item) }}
                className={item === page ? 'pagination__page pagination__page--current' : 'pagination__page'}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`Page ${item}`}
              >
                {item}
              </Link>
            </li>
          )
        )}
      </ol>

      {page < totalPages ? (
        <Link className="pagination__step" to={{ search: searchFor(page + 1) }} rel="next">
          Next
        </Link>
      ) : (
        <span className="pagination__step pagination__step--off">Next</span>
      )}
    </nav>
  );
}
