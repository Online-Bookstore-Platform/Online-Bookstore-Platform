import { Link } from 'react-router-dom';
import Container from '../components/shared/Container/Container.jsx';

export default function NotFoundPage() {
  return <section className="not-found"><Container><p className="eyebrow">Page not found</p><h1>That page wandered off.</h1><Link to="/">Return to folio</Link></Container></section>;
}
