import { Link } from 'react-router-dom';
import Container from '../../../components/shared/Container/Container.jsx';
import styles from './CategoriesPage.module.css';

const categoryImages = {
  Fiction: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=85',
  Fantasy: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=85',
  'Science Fiction': 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1200&q=85',
  Mystery: 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=1200&q=85',
  Romance: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1200&q=85',
  History: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1200&q=85',
  Biography: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=1200&q=85',
  Philosophy: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1200&q=85',
  Poetry: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=85',
  "Children's Books": 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=1200&q=85',
  Computing: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85',
  Science: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=85',
  Psychology: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=85',
  Business: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=85',
  Travel: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=85',
  Adventure: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=85',
  Classics: 'https://images.unsplash.com/photo-1491841550275-ad7854e35ca6?auto=format&fit=crop&w=1200&q=85',
  'Anime & Manga': 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1200&q=85',
};

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
].map(([name, description], index) => {
  return { id: index + 1, name, description, image: categoryImages[name] };
});

export default function CategoriesPage() {
  return <main className={styles.page}><Container>
    <header className={styles.header}><p className="eyebrow">Find your shelf</p><h1>A subject to follow.</h1><p>Browse the collection by what you feel like reading. Each shelf opens the matching catalogue category.</p></header>
    <ul className={styles.grid}>{categories.map(category => <li key={category.id}>
      <Link className={styles.card} to={`/catalogue?category=${category.id}`} aria-label={`Explore ${category.name}`}>
        <div className={styles.image} aria-hidden="true"><img className={styles.scene} src={category.image} alt="" loading="lazy" width="1200" height="800" /><span className={styles.number}>{String(category.id).padStart(2, '0')}</span></div>
        <div className={styles.copy}><div><h2>{category.name}</h2><p>{category.description}</p></div><span className={styles.arrow} aria-hidden="true">↗</span></div>
      </Link>
    </li>)}</ul>
    <p className={styles.footer}>Category shelves don’t indicate Folio stock. Book suggestions load in the catalogue.</p>
  </Container></main>;
}
