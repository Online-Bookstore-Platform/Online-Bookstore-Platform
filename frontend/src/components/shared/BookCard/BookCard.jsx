import styles from './BookCard.module.css';

export default function BookCard({ title, author, category, cover, palette, index, rating = null }) {
  return <article className={styles.card}>
    <div className={`${styles.cover} ${styles[palette] || ''}`} style={{ '--cover-index': index }} aria-label={cover ? `Cover of ${title}` : `Illustrated cover for ${title}`} role="img">
      {cover && <img className={styles.coverImage} src={cover} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }} />}
      <span className={styles.coverMark}>folio.</span><span className={styles.coverTitle}>{title}</span><span className={styles.coverAuthor}>{author}</span>
      <span className={styles.rating} aria-label={rating?.count ? `Rated ${Number(rating.average).toFixed(1)} out of 5 from ${rating.count} reviews` : 'No ratings yet'}><span aria-hidden="true">★</span> {rating?.count ? Number(rating.average).toFixed(1) : '—'}</span>
    </div>
    <div className={styles.meta}><div><h3>{title}</h3><p>{author}</p></div><span>{category}</span></div>
  </article>;
}
