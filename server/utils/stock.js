'use strict';

/** At or below this many copies a book is shown as "low stock". */
const LOW_STOCK_THRESHOLD = 5;

/**
 * Customer-facing availability label for a stock quantity. Exact quantities are
 * deliberately not exposed to customers.
 * @param {number} quantity
 * @returns {'in_stock' | 'low_stock' | 'out_of_stock'}
 */
function stockStatus(quantity) {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'low_stock';
  return 'in_stock';
}

module.exports = { LOW_STOCK_THRESHOLD, stockStatus };
