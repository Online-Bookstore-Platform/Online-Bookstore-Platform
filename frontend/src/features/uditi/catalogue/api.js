import { ApiError, apiRequest } from '../shared/api.js';

export const fetchBooks = (query, signal) => apiRequest(`/api/catalogue/books?${query}`, { signal });

export const fetchFilterOptions = signal => apiRequest('/api/catalogue/filters', { signal }).then(result => result.filters);

/**
 * Turn the cart API's failure into something a shopper can act on.
 * The cart itself belongs to the cart feature (Vrinda); this page only calls it.
 * Until that feature is connected the server answers 404 ("endpoint not found") or 503.
 */
export function friendlyCartError(error) {
  if (!(error instanceof ApiError)) return error;
  if (error.status === 401) return new ApiError(401, error.code, 'Sign in to add books to your cart.');
  const notConnected = error.status === 503 || (error.status === 404 && error.code === 'NOT_FOUND');
  if (notConnected) return new ApiError(error.status, error.code, 'The cart isn’t available yet. Please try again later.');
  return error;
}

/** Add one copy of a book through the cart API (POST /api/cart/items { bookId, quantity }). */
export async function addToCart(bookId) {
  try {
    await apiRequest('/api/cart/items', { method: 'POST', body: { bookId, quantity: 1 } });
  } catch (error) {
    throw friendlyCartError(error);
  }
}
