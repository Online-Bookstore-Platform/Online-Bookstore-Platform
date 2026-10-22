'use strict';

const { HttpError } = require('../utils/httpError');

/** Unknown /api route. */
function notFoundHandler(_req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'We could not find what you were looking for.' },
  });
}

/**
 * Central error handler. Known errors are returned as { error: { code, message,
 * details? } }. Anything unexpected becomes a generic 500 - the real cause is
 * logged on the server (without request bodies, so no customer data ends up in
 * the logs - SRS MAIN-2).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    const error = { code: err.code, message: err.message };
    if (err.details) error.details = err.details;
    return res.status(err.status).json({ error });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'The information sent could not be read. Please try again.' },
    });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'The information sent is too large.' },
    });
  }

  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again in a moment.' },
  });
}

module.exports = { notFoundHandler, errorHandler };
