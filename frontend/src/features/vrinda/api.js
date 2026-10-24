import { apiRequest } from '../uditi/shared/api.js';

export const registerCustomer = details => apiRequest('/api/users/register', { method: 'POST', body: details });
export const getProfile = signal => apiRequest('/api/profile', { signal }).then(result => result.user);
export const updateProfile = changes => apiRequest('/api/profile', { method: 'PATCH', body: changes }).then(result => result.user);
export const getCart = signal => apiRequest('/api/cart', { signal }).then(result => result.cart);
export const addCartItem = item => apiRequest('/api/cart/items', { method: 'POST', body: item }).then(result => result.cart);
export const updateCartItem = (itemId, quantity) => apiRequest(`/api/cart/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: { quantity } }).then(result => result.cart);
export const removeCartItem = itemId => apiRequest(`/api/cart/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }).then(result => result.cart);
export const getOrders = signal => apiRequest('/api/orders', { signal }).then(result => result.orders);
export const getOrder = (orderId, signal) => apiRequest(`/api/orders/${encodeURIComponent(orderId)}`, { signal }).then(result => result.order);
export const getOrderTracking = (orderId, signal) => apiRequest(`/api/orders/${encodeURIComponent(orderId)}/tracking`, { signal }).then(result => result.tracking);

export function fieldErrors(error) {
  return Object.fromEntries((error?.details ?? []).map(detail => [detail.field, detail.message]));
}

