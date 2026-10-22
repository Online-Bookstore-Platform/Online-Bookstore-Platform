'use strict';

const { badRequest } = require('../utils/httpError');

/**
 * Parse `data` with a zod schema. On failure throws a 400 HttpError that lists
 * the problem of every invalid field as { field, message } (the schemas carry
 * plain-language messages). A field gets ONE message - the first rule it broke -
 * so a blank city says "City is required." and not also "City is too short.".
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
    if (seen.has(field)) continue;
    seen.add(field);
    details.push({ field, message: issue.message });
  }
  throw badRequest(summary, details);
}

module.exports = { validate };
