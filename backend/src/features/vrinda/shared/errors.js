export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const asyncHandler = handler => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
export const badRequest = (message, details, code = 'VALIDATION_ERROR') => new HttpError(400, code, message, details);
export const notFound = (message, code = 'NOT_FOUND') => new HttpError(404, code, message);
export const unavailableDependency = message => new HttpError(503, 'DEPENDENCY_NOT_CONFIGURED', message);

const DATABASE_DOWN = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR']);

export function vrindaErrorHandler(error, _request, response, next) {
  if (error instanceof HttpError) {
    return response.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    });
  }
  if (DATABASE_DOWN.has(error?.code)) {
    return response.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'The bookstore database is not reachable right now. Please try again shortly.' } });
  }
  return next(error);
}

