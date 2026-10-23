/** Escape LIKE wildcards so "100%" or "a_b" are searched literally. */
export const escapeLike = text => text.replace(/[\\%_]/g, '\\$&');

/** "978-1-001-12648-7" -> "9781001126487"; null if the term cannot be (part of) an ISBN. */
export function isbnPrefixFromTerm(term) {
  if (!/^[0-9Xx-]+$/.test(term)) return null;
  const digits = term.replace(/-/g, '').toUpperCase();
  return digits.length >= 4 && digits.length <= 13 ? digits : null;
}
