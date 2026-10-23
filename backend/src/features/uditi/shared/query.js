import { badRequest } from './errors.js';

/**
 * Helper for validating a query string. Collects every problem, then `finish()`
 * throws one 400 listing them all in plain language.
 */
export function createQueryReader(query, summary = 'Some of the options are not valid. Please check them and try again.') {
  const problems = [];
  const fail = (field, message) => problems.push({ field, message });

  /** One trimmed text value, or undefined when absent/blank. A repeated parameter is a problem. */
  function single(field) {
    const value = query[field];
    if (Array.isArray(value)) {
      fail(field, 'Please provide only one value.');
      return undefined;
    }
    if (value === undefined || value === null || typeof value === 'object') return undefined;
    const text = String(value).trim();
    return text === '' ? undefined : text;
  }

  function integer(field, fallback, { min, max, label }) {
    const raw = single(field);
    if (raw === undefined) return fallback;
    const value = /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(value) || value < min || value > max) {
      fail(field, `${label} must be a whole number from ${min} to ${max}.`);
      return fallback;
    }
    return value;
  }

  function finish() {
    if (problems.length > 0) throw badRequest(summary, problems);
  }

  return { single, integer, fail, finish };
}
