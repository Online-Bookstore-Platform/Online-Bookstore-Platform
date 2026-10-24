import { badRequest } from '../shared/errors.js';

const MAX_QUANTITY = 4294967295;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseCartItem(body) {
  if (!isObject(body)) throw badRequest('Send the cart item as a JSON object.', [{ field: 'body', message: 'An object is required.' }]);
  const bookId = typeof body.bookId === 'string' && /^[1-9]\d{0,17}$/.test(body.bookId) ? Number(body.bookId) : body.bookId;
  const quantity = body.quantity ?? 1;
  const errors = [];
  if (!Number.isSafeInteger(bookId) || bookId < 1) errors.push({ field: 'bookId', message: 'Choose a valid book.' });
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) errors.push({ field: 'quantity', message: 'Quantity must be a positive whole number.' });
  if (errors.length) throw badRequest('Please correct the cart item.', errors);
  return { bookId, quantity };
}

export function parseItemId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,17}$/.test(value)) {
    throw badRequest('Choose a valid cart item.', [{ field: 'itemId', message: 'The book identifier is invalid.' }]);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw badRequest('Choose a valid cart item.', [{ field: 'itemId', message: 'The book identifier is too large.' }]);
  return id;
}

export function parseQuantity(body) {
  if (!isObject(body) || !Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > MAX_QUANTITY) {
    throw badRequest('Enter a valid quantity.', [{ field: 'quantity', message: 'Quantity must be a positive whole number.' }]);
  }
  return body.quantity;
}

