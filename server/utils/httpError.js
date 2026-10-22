'use strict';

/**
 * An error that should be shown to the API client as-is.
 * `message` is written for end users (clear, non-technical - SRS USE-2).
 */
class HttpError extends Error {
  /**
   * @param {number} status   HTTP status code
   * @param {string} code     stable machine-readable code, e.g. VALIDATION_ERROR
   * @param {string} message  user-facing message
   * @param {Array<{field: string, message: string}>} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, 'VALIDATION_ERROR', message, details);
const notFound = (message = 'We could not find what you were looking for.') =>
  new HttpError(404, 'NOT_FOUND', message);

module.exports = { HttpError, badRequest, notFound };
