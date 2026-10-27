import { Link } from 'react-router-dom';
import Container from '../components/shared/Container/Container.jsx';
import styles from './AboutPage.module.css';

const capabilities = [
  ['01', 'Discover by interest', 'Browse books across genres and subjects, or search by title, author, category, or ISBN.'],
  ['02', 'Read the details', 'Open a book page for available descriptions, publication information, previews, and reader reviews.'],
  ['03', 'Keep your reading together', 'Add stocked books to your cart, place an order, and return to your account to review order history.'],
];

const principles = [
  ['Useful discovery', 'Make it easier to move from a question or interest to a book worth exploring.'],
  ['Clear information', 'Show book details, prices, availability, and order status in the places readers need them.'],
  ['Accessible by design', 'Keep browsing and shopping understandable across screen sizes and light or dark themes.'],
  ['Straightforward shopping', 'Connect the catalogue, cart, delivery details, and orders in one familiar journey.'],
];

export default function AboutPage() {
  return <main className={styles.page}>
    <Container>
      <header className={styles.intro}>
        <div className={styles.introCopy}>
          <p className="eyebrow">A reader's corner</p>
          <h1>Find the book that stays with you.</h1>
          <p>Folio brings discovery and shopping together in a calm, organized place. Follow a subject, search for a familiar title, or let a new idea lead you somewhere unexpected.</p>
          <div className={styles.introActions}><Link to="/catalogue">Discover books <span aria-hidden="true">↗</span></Link><Link to="/categories">Explore categories</Link></div>
        </div>
        <figure className={styles.heroArtwork}><img src="/folio-reading.svg" alt="An illustrated reading nook with books" width="1200" height="960" /><figcaption>Make room for your next read.</figcaption></figure>
      </header>

      <section className={styles.purpose} aria-labelledby="purpose-title">
        <p className="eyebrow">Our purpose</p><h2 id="purpose-title">A clearer way to find your way around books.</h2>
        <p>Folio aims to make book discovery less scattered: browse an organized catalogue, compare useful details, and see clearly which books are available to buy. When you find one, browsing and ordering continue through the same account.</p>
      </section>

      <section className={styles.capabilities} aria-labelledby="readers-title">
        <div className={styles.sectionHeading}><p className="eyebrow">Made for readers</p><h2 id="readers-title">From first search to the next chapter.</h2></div>
        <div className={styles.featureGrid}>{capabilities.map(([number, title, copy]) => <article className={styles.feature} key={number}><span className={styles.number}>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <section className={styles.journey} aria-labelledby="journey-title">
        <div><p className="eyebrow">How Folio works</p><h2 id="journey-title">Four simple steps, all in one place.</h2></div>
        <ol>{[['Discover', 'Search for a title or browse subjects and genres.'], ['Choose', 'Read the book details and check its current store availability.'], ['Checkout', 'Review your cart, provide delivery details, and select a payment method.'], ['Follow your order', 'Return to your account to review order history and status.']].map(([title, copy], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></li>)}</ol>
      </section>

      <section className={styles.principles} aria-labelledby="principles-title">
        <div className={styles.sectionHeading}><p className="eyebrow">What guides us</p><h2 id="principles-title">A useful bookstore should feel considered.</h2></div>
        <div className={styles.principleGrid}>{principles.map(([title, copy]) => <article key={title}><span aria-hidden="true">✳</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <aside className={styles.closing}><div><p className="eyebrow">Your next read is out there</p><h2>Start wherever your curiosity takes you.</h2></div><div className={styles.introActions}><Link to="/catalogue">Browse the catalogue <span aria-hidden="true">↗</span></Link><Link to="/categories">Explore categories</Link></div></aside>
    </Container>
  </main>;
}
