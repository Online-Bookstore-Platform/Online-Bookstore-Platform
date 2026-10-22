import { Outlet } from 'react-router-dom';
import Navbar from '../components/shared/Navbar/Navbar.jsx';
import Footer from '../components/shared/Footer/Footer.jsx';

export default function MainLayout() {
  return <><a className="skip-link" href="#main-content">Skip to content</a><Navbar /><main id="main-content"><Outlet /></main><Footer /></>;
}
