import { HttpError } from '../errors.js';

const fields = ['title', 'author', 'isbn', 'openLibraryWorkId', 'category', 'description', 'price', 'coverImageUrl'];
const requiredFields = ['title', 'author', 'category', 'description', 'price'];

export function validateBookId(id) {
  if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, 'INVALID_BOOK_ID', 'The book identifier is invalid.');
  return id;
}

export function validateBookInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'INVALID_BOOK', 'Provide book details.');
  const keys = Object.keys(input);
  const unknown = keys.filter(key => !fields.includes(key));
  if (unknown.length) throw new HttpError(400, 'INVALID_BOOK_FIELDS', `These fields are not editable here: ${unknown.join(', ')}.`);
  if (!partial && requiredFields.some(field => input[field] === undefined)) throw new HttpError(400, 'MISSING_BOOK_FIELDS', 'Complete all required book details.');
  if (partial && keys.length === 0) throw new HttpError(400, 'EMPTY_BOOK_UPDATE', 'Provide at least one field to update.');

  const value = {};
  for (const field of keys) {
    const item = input[field];
    if (field === 'price') {
      const price = typeof item === 'string' && item.trim() ? Number(item) : item;
      if (!Number.isFinite(price) || price <= 0 || price > 1000000) throw new HttpError(400, 'INVALID_BOOK_PRICE', 'A purchasable book needs a valid price greater than zero.');
      value.price = Math.round(price * 100) / 100;
    } else {
      if (typeof item !== 'string') throw new HttpError(400, 'INVALID_BOOK_FIELD', `${field} must be text.`);
      const trimmed = item.trim();
      const max = field === 'description' ? 5000 : field === 'coverImageUrl' ? 2048 : field === 'openLibraryWorkId' ? 32 : 250;
      if (trimmed.length === 0 && field !== 'coverImageUrl' && field !== 'isbn' && field !== 'openLibraryWorkId') throw new HttpError(400, 'INVALID_BOOK_FIELD', `${field} cannot be empty.`);
      if (trimmed.length > max) throw new HttpError(400, 'INVALID_BOOK_FIELD', `${field} is too long.`);
      const normalizedIsbn = field === 'isbn' ? trimmed.replace(/[ -]/g, '').toUpperCase() : '';
      if (field === 'isbn' && trimmed && !(/^\d{9}[\dX]$/.test(normalizedIsbn) || /^97[89]\d{10}$/.test(normalizedIsbn))) throw new HttpError(400, 'INVALID_ISBN', 'Enter a valid ISBN-10 or ISBN-13.');
      if (field === 'openLibraryWorkId' && trimmed && !/^works\/OL\d+W$/.test(trimmed)) throw new HttpError(400, 'INVALID_OPEN_LIBRARY_WORK_ID', 'Provide a valid Open Library work ID.');
      if (field === 'coverImageUrl' && trimmed && !/^https?:\/\//i.test(trimmed)) throw new HttpError(400, 'INVALID_COVER_URL', 'Cover image must use an http or https URL.');
      value[field] = field === 'isbn' ? normalizedIsbn || '' : trimmed;
    }
  }
  return value;
}
