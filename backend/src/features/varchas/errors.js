export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function asyncHandler(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

export function unavailableDependency(name) {
  return new Proxy({}, {
    get: (_target, method) => async () => {
      throw new HttpError(503, 'DEPENDENCY_NOT_CONFIGURED', `${name}.${String(method)} is not connected to the project database/service contract yet.`);
    },
  });
}
