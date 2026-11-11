import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../features/uditi/shared/api.js';
import Container from '../components/shared/Container/Container.jsx';
import styles from './AboutPage.module.css';

const capabilities = [
  ['01', 'A wide, searchable collection', 'Browse books across genres and subjects, search by title or author, and explore useful publication details.'],
  ['02', 'Reader insight', 'Read customer reviews and ratings on book pages, alongside descriptions and available previews.'],
  ['03', 'A convenient way to shop', 'Manage a secure account, add stocked books to your cart, choose checkout options, and follow order status.'],
];

const principles = [
  ['Useful discovery', 'Make it easier to move from a question or interest to a book worth exploring.'],
  ['Clear information', 'Show book details, prices, availability, and order status in the places readers need them.'],
  ['Accessible by design', 'Keep browsing and shopping understandable across screen sizes and light or dark themes.'],
  ['Straightforward shopping', 'Connect the catalogue, cart, delivery details, and orders in one familiar journey.'],
];

export default function AboutPage() {
  const [contact, setContact] = useState({ name: '', email: '', subject: '', message: '' });
  const [contactState, setContactState] = useState({ busy: false, error: '', success: '' });
  const contactInFlight = useRef(false);
  async function submitContact(event) {
    event.preventDefault();
    if (contactInFlight.current) return;
    contactInFlight.current = true;
    setContactState({ busy: true, error: '', success: '' });
    try {
      await apiRequest('/api/contact', { method: 'POST', body: contact });
      setContact({ name: '', email: '', subject: '', message: '' });
      setContactState({ busy: false, error: '', success: 'Your message has been saved. Thank you for getting in touch.' });
    } catch (error) { setContactState({ busy: false, error: error.message || 'We could not send your message. Please try again.', success: '' }); }
    finally { contactInFlight.current = false; }
  }
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
        <p className="eyebrow">Our mission</p><h2 id="purpose-title">Make good books easier to find and enjoy.</h2>
        <p>Folio brings readers and books together through simple discovery and a clear shopping journey. Our goal is to make books accessible across genres, help every reader follow their curiosity, and make it easier to move from finding a title to bringing it home.</p>
      </section>

      <section className={styles.capabilities} aria-labelledby="readers-title">
        <div className={styles.sectionHeading}><p className="eyebrow">What we offer</p><h2 id="readers-title">From first search to the next chapter.</h2></div>
        <div className={styles.featureGrid}>{capabilities.map(([number, title, copy]) => <article className={styles.feature} key={number}><span className={styles.number}>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <section className={styles.journey} aria-labelledby="journey-title">
        <div><p className="eyebrow">How Folio works</p><h2 id="journey-title">Four simple steps, all in one place.</h2></div>
        <ol>{[['Discover', 'Search for a title or browse subjects and genres.'], ['Choose', 'Read the book details and check its current store availability.'], ['Checkout', 'Review your cart, provide delivery details, and select a payment method.'], ['Follow your order', 'Return to your account to review order history and status.']].map(([title, copy], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></li>)}</ol>
      </section>

      <section className={styles.principles} aria-labelledby="principles-title">
        <div className={styles.sectionHeading}><p className="eyebrow">Why choose Folio?</p><h2 id="principles-title">A useful bookstore should feel considered.</h2></div>
        <div className={styles.principleGrid}>{principles.map(([title, copy]) => <article key={title}><span aria-hidden="true">✳</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <section className={styles.contact} id="contact" aria-labelledby="contact-title">
        <div><p className="eyebrow">We’re listening</p><h2 id="contact-title">Get in touch</h2><p>Send a question or a note to the Folio team. We’ll save your message so it can be followed up.</p></div>
        <form onSubmit={submitContact}>
          <label>Name<input name="name" autoComplete="name" required minLength={2} maxLength={100} value={contact.name} onChange={event => setContact({ ...contact, name: event.target.value })} /></label>
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} value={contact.email} onChange={event => setContact({ ...contact, email: event.target.value })} /></label>
          <label>Subject<input name="subject" required minLength={3} maxLength={150} value={contact.subject} onChange={event => setContact({ ...contact, subject: event.target.value })} /></label>
          <label>Message<textarea name="message" required minLength={10} maxLength={4000} value={contact.message} onChange={event => setContact({ ...contact, message: event.target.value })} /></label>
          <button type="submit" disabled={contactState.busy}>{contactState.busy ? 'Sending…' : 'Send message'}</button>
          {contactState.success && <p role="status">{contactState.success}</p>}{contactState.error && <p role="alert">{contactState.error}</p>}
        </form>
      </section>

      <section className={styles.purpose} aria-labelledby="vision-title">
        <p className="eyebrow">Our vision</p><h2 id="vision-title">A reading life with more room for discovery.</h2>
        <p>We hope to make reading an inviting part of everyday life by making the next book easier to find. A thoughtful catalogue can open paths across genres, connect familiar interests to new ones, and help readers keep exploring at their own pace.</p>
      </section>
      <aside className={styles.closing}><div><p className="eyebrow">Your next read is out there</p><h2>Start wherever your curiosity takes you.</h2></div><div className={styles.introActions}><Link to="/catalogue">Browse the catalogue <span aria-hidden="true">↗</span></Link><Link to="/categories">Explore categories</Link></div></aside>
      <section className={styles.authors} aria-labelledby="authors-title">
        <div className={styles.sectionHeading}><p className="eyebrow">An editorial appreciation</p><h2 id="authors-title">Authors Who Inspire Us</h2><p>Three distinctive bodies of work that continue to invite readers into new worlds, questions, and puzzles. This is Folio's appreciation, not an endorsement or partnership.</p></div>
        <div className={styles.authorGrid}>
          <article><span aria-hidden="true">JKR</span><h3>J. K. Rowling</h3><p>Her Harry Potter novels introduced generations of readers to an expansive story of friendship, courage, and belonging, and helped many young readers find a lasting relationship with books.</p></article>
          <article><span aria-hidden="true">GRRM</span><h3>George R. R. Martin</h3><p>Through intricate fantasy and morally complex characters, Martin shows how richly imagined worlds can examine power, loyalty, and the choices people make under pressure.</p></article>
          <article><span aria-hidden="true">AC</span><h3>Agatha Christie</h3><p>Christie's carefully constructed mysteries reward attention and curiosity. Her enduring detectives and ingenious plots have shaped the pleasure of solving a story alongside its characters.</p></article>
        </div>
      </section>
    </Container>
  </main>;
}
