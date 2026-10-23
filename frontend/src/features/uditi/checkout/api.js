import { ApiError, apiRequest } from '../shared/api.js';

export const fetchSummary = signal => apiRequest('/api/checkout/summary', { signal }).then(result => result.checkout);

export const saveDelivery = details => apiRequest('/api/checkout/delivery', { method: 'PUT', body: details }).then(result => result.delivery);

export const ORDER_SERVICE_UNAVAILABLE = 'ORDER_SERVICE_UNAVAILABLE';

/**
 * ORDER-DRAFT CONTRACT (proposed - not yet documented by the order feature, owned by Vrinda):
 *   POST /api/orders   { delivery }   ->   201 { order: { id, orderNumber, totalAmount, ... } }
 * The order is built on the server from the signed-in user's cart at current prices. Payment
 * then continues on Varchas's /payment?orderId=<id>. If the order service is not connected the
 * server answers 404 (unknown endpoint) or 503; that is reported honestly, never as success.
 */
export async function createOrderDraft(delivery) {
  let result;
  try {
    result = await apiRequest('/api/orders', { method: 'POST', body: { delivery } });
  } catch (error) {
    throw orderServiceProblem(error);
  }
  if (result?.order?.id === undefined || result?.order?.id === null) {
    throw new ApiError(502, 'ORDER_INVALID', 'The order service answered without an order. Please try again.');
  }
  return result.order;
}

export function orderServiceProblem(error) {
  if (!(error instanceof ApiError)) return error;
  const notConnected = error.status === 503 || (error.status === 404 && error.code === 'NOT_FOUND');
  if (notConnected) {
    return new ApiError(error.status, ORDER_SERVICE_UNAVAILABLE, 'Your delivery details are saved, but the order service isn’t connected yet, so we can’t place your order. Please try again later.');
  }
  return error;
}

/** Varchas's payment page takes the order id in the address. */
export const paymentPath = order => `/payment?orderId=${encodeURIComponent(order.id)}`;
