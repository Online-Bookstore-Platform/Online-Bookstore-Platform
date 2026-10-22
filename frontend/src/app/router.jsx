import { createBrowserRouter } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout.jsx';
import HomePage from '../pages/HomePage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import AuthenticationPage from '../features/varchas/authentication/index.jsx';
import BookDetailsPage from '../features/varchas/book-details/index.jsx';
import PaymentPage from '../features/varchas/payments/index.jsx';
import AdminCataloguePage from '../features/varchas/admin-catalogue/index.jsx';
import CataloguePage from '../features/uditi/catalogue/index.jsx';
import CheckoutPage from '../features/uditi/checkout/index.jsx';
import InventoryPage from '../features/uditi/inventory/index.jsx';
import RegistrationProfilePage from '../features/vrinda/registration-profile/index.jsx';
import CartPage from '../features/vrinda/cart/index.jsx';
import OrdersPage from '../features/vrinda/orders/index.jsx';

export const router = createBrowserRouter([
  {
    element: <MainLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <AuthenticationPage /> },
      { path: '/books/:bookId', element: <BookDetailsPage /> },
      { path: '/payment', element: <PaymentPage /> },
      { path: '/admin', element: <AdminCataloguePage /> },
      { path: '/catalogue', element: <CataloguePage /> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/inventory', element: <InventoryPage /> },
      { path: '/register', element: <RegistrationProfilePage /> },
      { path: '/profile', element: <RegistrationProfilePage profile /> },
      { path: '/cart', element: <CartPage /> },
      { path: '/orders', element: <OrdersPage /> },
      { path: '/orders/:orderId', element: <OrdersPage tracking /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
