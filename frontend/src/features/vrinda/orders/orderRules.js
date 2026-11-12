export const CUSTOMER_CANCELLABLE_STATUSES = new Set([
  'pending', 'pending_collection', 'paid', 'confirmed', 'processing', 'packed',
]);

export const canCustomerCancelOrder = status => CUSTOMER_CANCELLABLE_STATUSES.has(status);
