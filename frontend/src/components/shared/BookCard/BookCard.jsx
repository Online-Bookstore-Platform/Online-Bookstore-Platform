import styles from './BookCard.module.css';

export default function BookCard({ title, author, category, cover, palette, index }) {
  return <article className={styles.card}>
    <div className={`${styles.cover} ${styles[palette] || ''}`} style={{ '--cover-index': index }} aria-label={`Illustrated placeholder cover for ${title}`} role="img">
      <span className={styles.coverMark}>{cover}</span><span className={styles.coverTitle}>{title}</span><span className={styles.coverAuthor}>{author}</span>
    </div>
    <div className={styles.meta}><div><h3>{title}</h3><p>{author}</p></div><span>{category}</span></div>
  </article>;
}
