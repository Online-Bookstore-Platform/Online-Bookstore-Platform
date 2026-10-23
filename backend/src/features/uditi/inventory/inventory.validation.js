import { badRequest } from '../shared/errors.js';
import { createQueryReader } from '../shared/query.js';
import { MAX_STOCK } from './stock.js';

const MAX_LINES = 50;
const formatted = n => n.toLocaleString('en-US');
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Path parameter :bookId */
export function parseBookId(raw) {
  if (!/^[1-9]\d{0,17}$/.test(raw ?? '')) throw badRequest('That book id is not valid.', undefined, 'INVALID_BOOK_ID');
  return Number(raw);
}

function parseReason(value, problems) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    problems.push({ field: 'reason', message: 'The reason must be text.' });
    return undefined;
  }
  const reason = value.trim();
  if (reason.length > 200) problems.push({ field: 'reason', message: 'The reason is too long (up to 200 characters).' });
  return reason || undefined;
}

function requireObject(body, summary) {
  if (!isPlainObject(body)) throw badRequest(summary, [{ field: 'body', message: 'Send the details as a JSON object.' }]);
}

/** PUT body: set the stock to an exact number (a stock-take). */
export function parseSetStockBody(body) {
  const summary = 'The stock quantity is not valid.';
  requireObject(body, summary);
  const problems = [];
  const { quantity } = body;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) problems.push({ field: 'quantity', message: 'Quantity must be a whole number.' });
  else if (quantity < 0) problems.push({ field: 'quantity', message: 'Quantity cannot be negative.' });
  else if (quantity > MAX_STOCK) problems.push({ field: 'quantity', message: `Quantity cannot be more than ${formatted(MAX_STOCK)}.` });
  const reason = parseReason(body.reason, problems);
  if (problems.length > 0) throw badRequest(summary, problems);
  return { quantity, reason };
}

/** PATCH body: add (+) or remove (-) copies, e.g. a delivery arrived or copies were damaged. */
export function parseAdjustStockBody(body) {
  const summary = 'The stock change is not valid.';
  requireObject(body, summary);
  const problems = [];
  const { change } = body;
  if (typeof change !== 'number' || !Number.isInteger(change)) problems.push({ field: 'change', message: 'Change must be a whole number such as 10 or -2.' });
  else if (change === 0) problems.push({ field: 'change', message: 'Change cannot be zero.' });
  else if (Math.abs(change) > MAX_STOCK) problems.push({ field: 'change', message: `Change cannot be more than ${formatted(MAX_STOCK)} copies.` });
  const reason = parseReason(body.reason, problems);
  if (problems.length > 0) throw badRequest(summary, problems);
  return { change, reason };
}

/** Query string of GET /api/inventory/stock */
export function parseListStockQuery(query) {
  const read = createQueryReader(query);
  const { single, integer, fail } = read;

  const q = single('q');
  if (q !== undefined && q.length > 100) fail('q', 'Search text is too long (up to 100 characters).');
  const status = single('status') ?? 'all';
  if (!['all', 'low', 'out'].includes(status)) fail('status', 'Status must be "all", "low" or "out".');
  const page = integer('page', 1, { min: 1, max: 100000, label: 'Page' });
  const pageSize = integer('pageSize', 20, { min: 1, max: 100, label: 'Page size' });

  read.finish();
  return { terms: q ? q.split(/\s+/).slice(0, 8) : [], status, page, pageSize };
}

/** Query string of GET /api/inventory/availability: ?bookIds=1,2,3 */
export function parseAvailabilityQuery(query) {
  const read = createQueryReader(query);
  const raw = read.single('bookIds');
  let bookIds = [];
  if (raw === undefined) read.fail('bookIds', 'Provide the book ids to check, for example bookIds=1,2,3.');
  else {
    const parts = raw.split(',').map(part => part.trim());
    if (parts.length > MAX_LINES || !parts.every(part => /^[1-9]\d{0,17}$/.test(part))) read.fail('bookIds', `Provide up to ${MAX_LINES} valid book ids separated by commas.`);
    else bookIds = [...new Set(parts.map(Number))];
  }
  read.finish();
  return bookIds;
}

/** Body of POST /api/inventory/validate: { items: [{ bookId, quantity }] } */
export function parseValidateBody(body) {
  const summary = 'The items to check are not valid.';
  requireObject(body, summary);
  const { items } = body;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINES) {
    throw badRequest(summary, [{ field: 'items', message: `Send between 1 and ${MAX_LINES} items.` }]);
  }
  const problems = [];
  const lines = items.map((item, index) => {
    const bookId = isPlainObject(item) && typeof item.bookId === 'string' && /^[1-9]\d{0,17}$/.test(item.bookId) ? Number(item.bookId) : item?.bookId;
    const quantity = item?.quantity;
    if (!Number.isInteger(bookId) || bookId < 1) problems.push({ field: `items.${index}.bookId`, message: 'Choose a valid book.' });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_STOCK) problems.push({ field: `items.${index}.quantity`, message: 'Quantity must be a whole number of at least 1.' });
    return { bookId, quantity };
  });
  if (problems.length > 0) throw badRequest(summary, problems);
  return lines;
}
