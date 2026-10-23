/** Display helpers shared by Uditi's pages. */

export function formatPrice(value, currency = 'INR') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Price unavailable';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);
}

export const STOCK_LABELS = {
  in_stock: 'In stock',
  low_stock: 'Only a few left',
  out_of_stock: 'Out of stock',
};

export const stockLabel = status => STOCK_LABELS[status] ?? 'Availability unknown';

export const pluralize = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** Lowercase, hyphenated class-name-safe version of a status such as "low_stock". */
export const statusClass = status => String(status).replace(/_/g, '-');

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
