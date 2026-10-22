import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const TYPING_PAUSE_MS = 350;

/**
 * Search box in the page header. On the catalogue it searches as you type
 * (after a short pause); on any other page it takes you to the catalogue.
 */
export default function SearchBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const onCatalogue = pathname === '/';
  const urlQuery = onCatalogue ? (params.get('q') ?? '') : '';

  const [text, setText] = useState(urlQuery);
  const lastApplied = useRef(urlQuery.trim());

  // Follow the URL when it changes for another reason (Back button, "Clear search"...).
  useEffect(() => {
    if (urlQuery.trim() !== lastApplied.current) {
      lastApplied.current = urlQuery.trim();
      setText(urlQuery);
    }
  }, [urlQuery]);

  function applyOnCatalogue(query) {
    lastApplied.current = query;
    const next = new URLSearchParams(params);
    if (query) next.set('q', query);
    else next.delete('q');
    next.delete('page');
    setParams(next, { replace: true });
  }

  // Search while typing, once the person pauses.
  useEffect(() => {
    if (!onCatalogue) return undefined;
    const query = text.trim();
    if (query === lastApplied.current) return undefined;
    const timer = setTimeout(() => applyOnCatalogue(query), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, onCatalogue]);

  function handleSubmit(event) {
    event.preventDefault();
    const query = text.trim();
    if (onCatalogue) applyOnCatalogue(query);
    else navigate(query ? `/?q=${encodeURIComponent(query)}` : '/');
  }

  return (
    <form className="search" role="search" onSubmit={handleSubmit}>
      <label className="visually-hidden" htmlFor="site-search">
        Search books by title, author, category or ISBN
      </label>
      <svg className="search__icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <input
        id="site-search"
        className="search__input"
        type="search"
        value={text}
        maxLength={100}
        autoComplete="off"
        placeholder="Title, author, category, ISBN"
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="btn">
        Search
      </button>
    </form>
  );
}
