import { Link } from 'react-router-dom';
import Container from '../components/shared/Container/Container.jsx';
import Section from '../components/shared/Section/Section.jsx';
import Button from '../components/shared/Button/Button.jsx';
import BookCard from '../components/shared/BookCard/BookCard.jsx';

const books = [
  { title: 'The Art of Noticing', author: 'Rob Walker', category: 'Culture', cover: 'A practice in attention', palette: 'sage' },
  { title: 'Small Things Like These', author: 'Claire Keegan', category: 'Fiction', cover: 'A quiet kind of courage', palette: 'clay' },
  { title: 'Ways of Being', author: 'James Bridle', category: 'Ideas', cover: 'Beyond human intelligence', palette: 'ink' },
  { title: 'The Creative Act', author: 'Rick Rubin', category: 'Craft', cover: 'A way of being', palette: 'plum' },
];
const categories = [ ['Fiction', 'Stories to get lost in', '01'], ['Art & design', 'For a more considered eye', '02'], ['Ideas', 'New ways to see things', '03'], ['Life & culture', 'Notes on being here', '04'] ];

export default function HomePage() {
  return <>
    <section className="hero"><Container className="hero-grid"><div className="hero-copy"><p className="eyebrow">An independent bookshop for curious minds</p><h1>Find your next <em>great read.</em></h1><p className="hero-description">Good books change the way a day feels. Find the one that meets you where you are, or takes you somewhere new.</p><div className="hero-actions"><Button to="/catalogue">Explore the collection <span aria-hidden="true">↗</span></Button><a className="text-link" href="#featured">A few of our favorites <span aria-hidden="true">↓</span></a></div><div className="hero-footnote"><span className="hero-star" aria-hidden="true">✳</span> Thoughtfully chosen. Happily read.</div></div><div className="hero-art" aria-label="A curated stack of books" role="img"><div className="sun-disc" /><div className="hero-book hero-book-back"><span>THE SHAPE<br />OF THINGS</span><small>ESSAYS ON A LIFE</small></div><div className="hero-book hero-book-mid"><span>WAYS<br />OF SEEING</span><small>JOHN BERGER</small></div><div className="hero-book hero-book-front"><span>THE<br />LIVING<br />MOUNTAIN</span><small>NAN SHEPHERD</small></div><div className="hero-caption">A good book is a door left open.</div></div></Container></section>
    <Section id="featured" eyebrow="A place to begin" title="A few worth lingering over" description="A small selection of books we keep coming back to."><div className="book-grid">{books.map((book, index) => <BookCard key={book.title} {...book} index={index} />)}</div><div className="section-link"><Link to="/catalogue">See the full collection <span aria-hidden="true">↗</span></Link></div></Section>
    <Section id="categories" tone="section-soft" eyebrow="Find your shelf" title="Follow what interests you."><div className="category-grid">{categories.map(([name, detail, number]) => <Link className="category-card" key={name} to="/catalogue"><span>{number}</span><div><h3>{name}</h3><p>{detail}</p></div><b aria-hidden="true">↗</b></Link>)}</div></Section>
    <section id="about" className="editorial"><Container className="editorial-inner"><div className="editorial-stamp" aria-hidden="true">F<br />·</div><div><p className="eyebrow">A note from folio</p><h2>Reading is a way<br />of <em>paying attention.</em></h2><p>We believe the right book can make the familiar feel new again. So we gather stories, ideas, and small discoveries worth making room for.</p><Link to="/catalogue">Find something unexpected <span aria-hidden="true">↗</span></Link></div></Container></section>
    <Section eyebrow="For the in-between moments" title="A collection for slower days" description="Books that invite you to pause, look closer, and take the long way home." tone="section-collection"><div className="collection-panel"><div className="collection-copy"><span className="collection-tag">The folio edit · 06 books</span><h3>On noticing<br />the little things</h3><p>For when the world could use a closer look.</p><Button to="/catalogue" variant="light">Browse the edit <span aria-hidden="true">↗</span></Button></div><div className="mini-covers" aria-hidden="true"><div className="mini-cover mini-one">THE<br />LIVING<br />MOUNTAIN</div><div className="mini-cover mini-two">FIELD<br />NOTES</div><div className="mini-cover mini-three">A WALK<br />IN THE<br />WOODS</div></div></div></Section>
    <section className="closing"><Container><p className="eyebrow">Whenever you're ready</p><h2>There’s a story<br />with your name on it.</h2><Button to="/catalogue">Come find it <span aria-hidden="true">↗</span></Button></Container></section>
  </>;
}
