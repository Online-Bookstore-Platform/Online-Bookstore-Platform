/** At or below this many copies a book is shown as "low stock". */
export const LOW_STOCK_THRESHOLD = 5;

/** The most copies of one book an administrator can record. */
export const MAX_STOCK = 1000000;

/**
 * Customer-facing availability for a stock quantity. Exact quantities are
 * deliberately not exposed to customers.
 * @param {number} quantity
 * @returns {'in_stock' | 'low_stock' | 'out_of_stock'}
 */
export function stockStatus(quantity) {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'low_stock';
  return 'in_stock';
}
