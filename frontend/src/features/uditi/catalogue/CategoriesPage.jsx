import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../../../components/shared/Container/Container.jsx';
import { isAbort } from '../shared/api.js';
import { fetchBooks } from './api.js';
import { DEFAULT_STATE, toApiParams } from './catalogueParams.js';
import styles from './CategoriesPage.module.css';

const categories = [
  ['Fiction', 'Stories that open a door into another life.'], ['Fantasy', 'Impossible worlds, strange magic, and quests.'],
  ['Science Fiction', 'Big ideas about technology, time, and tomorrow.'], ['Mystery', 'Clues, questions, and the pleasure of a reveal.'],
  ['Romance', 'Stories about connection, change, and belonging.'], ['History', 'People and events that shaped the world around us.'],
  ['Biography', 'Lives, told by the people who knew them best.'], ['Philosophy', 'Questions that reward a little more thought.'],
  ['Poetry', 'Precise words, unexpected rhythms, lasting images.'], ["Children's Books", 'Stories and discoveries for younger readers.'],
  ['Computing', 'Programming, systems, and the tools we build.'], ['Science', 'Clear-eyed explorations of the natural world.'],
  ['Psychology', 'Ways to understand thought, feeling, and behaviour.'], ['Business', 'Ideas for making, leading, and working well.'],
  ['Travel', 'Places and perspectives beyond the everyday.'], ['Adventure', 'Journeys into the unknown, real and imagined.'],
  ['Classics', 'Enduring works that continue to find new readers.'], ['Anime & Manga', 'Manga, anime, and illustrated Japanese storytelling.'],
].map(([name, description], index) => ({ id: index + 1, name, description }));

async function loadCategoryCovers(signal) {
  const result = new Map();
  // Keep provider traffic bounded while still sourcing a representative result for each shelf.
  for (let start = 0; start < categories.length; start += 3) {
    const batch = categories.slice(start, start + 3);
    const rows = await Promise.all(batch.map(async category => {
      try {
        const query = toApiParams({ ...DEFAULT_STATE, categories: [category.id] });
        const body = await fetchBooks(query.toString(), signal);
        return [category.id, { status: 'ready', book: body.books?.[0] || null }];
      } catch (error) {
        return [category.id, isAbort(error) ? { status: 'aborted' } : { status: 'error' }];
      }
    }));
    rows.forEach(([id, value]) => result.set(id, value));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  }
  return result;
}

export default function CategoriesPage() {
  const [state, setState] = useState({ status: 'loading', results: new Map() });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', results: new Map() });
    loadCategoryCovers(controller.signal).then(results => setState({ status: 'ready', results }))
      .catch(error => { if (!isAbort(error)) setState({ status: 'error', results: new Map() }); });
    return () => controller.abort();
  }, [reload]);

  const failedCount = [...state.results.values()].filter(result => result.status === 'error').length;

  return <main className={styles.page}>
    <Container>
      <header className={styles.header}>
        <p className="eyebrow">Find your shelf</p>
        <h1>A subject to follow.</h1>
        <p>Browse the collection by what you feel like reading. Each shelf brings together books found through our discovery catalogue.</p>
      </header>
      {(state.status === 'error' || failedCount > 0) && <div className={styles.notice} role={state.status === 'error' || failedCount === categories.length ? 'alert' : 'status'}><p>{state.status === 'error' || failedCount === categories.length ? 'We couldn’t load category suggestions just now.' : `Suggestions are unavailable for ${failedCount} ${failedCount === 1 ? 'category' : 'categories'}.`}</p><button type="button" onClick={() => setReload(value => value + 1)}>Try again</button></div>}
      <ul className={styles.grid} aria-busy={state.status === 'loading'}>
        {categories.map(category => {
          const result = state.results.get(category.id);
          const book = result?.book;
          const failed = result?.status === 'error';
          return <li key={category.id}>
            <Link className={styles.card} to={`/catalogue?category=${category.id}`} aria-label={`Explore ${category.name}`}>
              <div className={styles.image}>
                {book?.coverImageUrl
                  ? <img src={book.coverImageUrl} alt={`Cover of ${book.title}`} loading="lazy" onError={event => { event.currentTarget.remove(); event.currentTarget.parentElement.dataset.coverFailed = 'true'; }} />
                  : <span className={styles.fallback}>{state.status === 'loading' ? 'Finding a book…' : failed ? 'Suggestions unavailable' : 'No cover available'}</span>}
                <span className={styles.number}>{String(category.id).padStart(2, '0')}</span>
              </div>
              <div className={styles.copy}><div><h2>{category.name}</h2><p>{category.description}</p>{book && <small>Featuring <em>{book.title}</em></small>}</div><span className={styles.arrow} aria-hidden="true">↗</span></div>
            </Link>
          </li>;
        })}
      </ul>
      <p className={styles.footer}>Suggestions come from Open Library and Google Books when available. Category shelves don’t indicate Folio stock.</p>
    </Container>
  </main>;
}
