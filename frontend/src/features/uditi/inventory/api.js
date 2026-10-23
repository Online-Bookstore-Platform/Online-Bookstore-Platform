import { apiRequest } from '../shared/api.js';

export const fetchStock = (query, signal) => apiRequest(`/api/inventory/stock?${query}`, { signal });

/** Set an exact number of copies (a stock-take). Returns the updated record. */
export const setStock = (bookId, body) => apiRequest(`/api/inventory/stock/${encodeURIComponent(bookId)}`, { method: 'PUT', body }).then(result => result.stock);

/** Add (positive) or remove (negative) copies. Safe while customers are buying. Returns the updated record. */
export const adjustStock = (bookId, body) => apiRequest(`/api/inventory/stock/${encodeURIComponent(bookId)}`, { method: 'PATCH', body }).then(result => result.stock);
