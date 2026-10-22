import { Link, Route, Routes } from 'react-router-dom';
import Header from './components/Header.jsx';
import CataloguePage from './pages/CataloguePage.jsx';

function NotFoundPage() {
  return (
    <main className="details">
      <div className="state">
        <h1 className="state__title">This page does not exist</h1>
        <p className="state__text">The link may be old or mistyped.</p>
        <Link to="/" className="btn">
          Browse books
        </Link>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <div id="main">
        <Routes>
          <Route path="/" element={<CataloguePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </>
  );
}
