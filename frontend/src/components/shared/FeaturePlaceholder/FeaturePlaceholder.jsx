import { Link } from 'react-router-dom';
import Container from '../Container/Container.jsx';
import styles from './FeaturePlaceholder.module.css';

export default function FeaturePlaceholder({ title, description }) {
  return <section className={styles.page}><Container><p className="eyebrow">Explore Folio</p><h1>{title}</h1><p className={styles.description}>{description}</p><Link className={styles.back} to="/catalogue">Explore the bookstore <span aria-hidden="true">↗</span></Link></Container></section>;
}
