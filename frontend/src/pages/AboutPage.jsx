import { Link } from 'react-router-dom';
import Container from '../components/shared/Container/Container.jsx';
import styles from './AboutPage.module.css';

export default function AboutPage() {
  return <main className={styles.page}>
    <Container>
      <header className={styles.intro}>
        <div className={styles.introCopy}>
          <p className="eyebrow">Books for the curious</p>
          <h1>A little more room<br />for <em>good questions.</em></h1>
          <p>Folio is an online bookstore project built around the pleasure of finding a book you did not know you needed. Browse a wide world of stories and ideas, then keep the reads you love together in one place.</p>
          <div className={styles.introActions}><Link to="/catalogue">Explore books <span aria-hidden="true">↗</span></Link><Link to="/categories">Browse subjects</Link></div>
        </div>
        <figure className={styles.heroArtwork}><img src="/folio-reading.svg" alt="" width="1200" height="960" /><figcaption>A good book makes a little room for wonder.</figcaption></figure>
      </header>
      <div className={styles.rule} aria-hidden="true"><span>folio · a reader's corner</span></div>
      <section className={styles.sections} aria-label="The Folio experience">
        <article><span className={styles.number}>01</span><div><h2>Follow your curiosity</h2><p>Search by title, author, subject, or ISBN. Folio brings together live book discovery and a local catalogue, with clear details about which books are available to buy.</p><Link to="/catalogue">Explore the catalogue <span aria-hidden="true">↗</span></Link></div></article>
        <article><span className={styles.number}>02</span><div><h2>Make time to read</h2><p>Book details gather the information available from their sources, including descriptions, publication details, and supported previews or reading links. Reader feedback is presented with care and clarity.</p><Link to="/catalogue">Find a book to read <span aria-hidden="true">↗</span></Link></div></article>
        <article><span className={styles.number}>03</span><div><h2>Keep the good ones close</h2><p>For books stocked by Folio, your cart, delivery details, and order history stay connected to your account. Prices and availability are checked against the bookstore catalogue as you shop.</p><Link to="/profile">Visit your account <span aria-hidden="true">↗</span></Link></div></article>
      </section>
      <aside className={styles.note}><p className="eyebrow">A note from Folio</p><blockquote>“Reading is a way of paying attention.”</blockquote><Link to="/catalogue">Start discovering <span aria-hidden="true">↗</span></Link></aside>
    </Container>
  </main>;
}
