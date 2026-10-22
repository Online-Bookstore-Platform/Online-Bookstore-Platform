'use strict';

const { badRequest } = require('../utils/httpError');

/**
 * Parse `data` with a zod schema. On failure throws a 400 HttpError that lists
 * every problem as { field, message } (the schemas carry plain-language messages).
 *
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {unknown} data
 * @param {string} [summary] top-level message shown to the person
 * @returns {T}
 */
function validate(schema, data, summary = 'Some of the information is not valid. Please check it and try again.') {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;

  const seen = new Set();
  const details = [];
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || 'body';
    const key = `${field}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    details.push({ field, message: issue.message });
  }
  throw badRequest(summary, details);
}

module.exports = { validate };
