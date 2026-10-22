'use strict';

const { z } = require('zod');
const { badRequest } = require('../utils/httpError');

const MAX_STOCK = 1000000;

const reason = z
  .string({ error: 'The reason must be text.' })
  .trim()
  .max(200, 'The reason is too long (up to 200 characters).')
  .optional()
  .transform((value) => (value ? value : undefined));

/** PUT body: set the stock to an exact number (a stock-take). */
const setStockBody = z.object({
  quantity: z
    .number({ error: 'Quantity must be a whole number.' })
    .int('Quantity must be a whole number.')
    .min(0, 'Quantity cannot be negative.')
    .max(MAX_STOCK, `Quantity cannot be more than ${MAX_STOCK.toLocaleString('en-US')}.`),
  reason,
});

/** PATCH body: add (+) or remove (-) copies, e.g. a delivery arrived or copies were damaged. */
const adjustStockBody = z.object({
  change: z
    .number({ error: 'Change must be a whole number such as 10 or -2.' })
    .int('Change must be a whole number such as 10 or -2.')
    .min(-MAX_STOCK, `Change cannot be more than ${MAX_STOCK.toLocaleString('en-US')} copies.`)
    .max(MAX_STOCK, `Change cannot be more than ${MAX_STOCK.toLocaleString('en-US')} copies.`)
    .refine((n) => n !== 0, 'Change cannot be zero.'),
  reason,
});

/** Path parameter :bookId */
function parseBookId(raw) {
  if (!/^[1-9]\d{0,17}$/.test(raw ?? '')) throw badRequest('That book id is not valid.');
  return Number(raw);
}

/** Query string of GET /api/inventory */
function parseListStockQuery(query) {
  const problems = [];
  const single = (field) => {
    const value = query[field];
    if (Array.isArray(value)) {
      problems.push({ field, message: 'Please provide only one value.' });
      return undefined;
    }
    const text = value === undefined ? '' : String(value).trim();
    return text === '' ? undefined : text;
  };

  const q = single('q');
  if (q !== undefined && q.length > 100) problems.push({ field: 'q', message: 'Search text is too long (up to 100 characters).' });

  const status = single('status') ?? 'all';
  if (!['all', 'low', 'out'].includes(status)) {
    problems.push({ field: 'status', message: 'Status must be "all", "low" or "out".' });
  }

  const integer = (field, fallback, min, max, label) => {
    const raw = single(field);
    if (raw === undefined) return fallback;
    const value = /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;
    if (!(value >= min && value <= max)) {
      problems.push({ field, message: `${label} must be a whole number from ${min} to ${max}.` });
      return fallback;
    }
    return value;
  };
  const page = integer('page', 1, 1, 100000, 'Page');
  const pageSize = integer('pageSize', 20, 1, 100, 'Page size');

  if (problems.length > 0) {
    throw badRequest('Some of the search options are not valid. Please check them and try again.', problems);
  }
  return { q: q ? q.split(/\s+/).slice(0, 8) : [], status, page, pageSize };
}

module.exports = { setStockBody, adjustStockBody, parseBookId, parseListStockQuery, MAX_STOCK };
