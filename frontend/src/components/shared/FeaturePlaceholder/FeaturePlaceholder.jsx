import { Link } from 'react-router-dom';
import Container from '../Container/Container.jsx';
import styles from './FeaturePlaceholder.module.css';

export default function FeaturePlaceholder({ title, description, owner, story }) {
  return <section className={styles.page}><Container><p className="eyebrow">A folio work in progress</p><p className={styles.number}>{story}</p><h1>{title}</h1><p className={styles.description}>{description}</p><div className={styles.note}><span className={styles.dot} aria-hidden="true" /><span>This page is a static placeholder. Feature implementation is still to come.</span></div><p className={styles.owner}>Planned owner <strong>{owner}</strong></p><Link className={styles.back} to="/catalogue">Explore the bookstore <span aria-hidden="true">↗</span></Link></Container></section>;
}
