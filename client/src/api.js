import { API_BASE_URL } from './config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, { body, signal, headers } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      method,
      signal,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('We could not reach the bookstore. Check your connection and try again.', { code: 'NETWORK' });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!response.ok) {
    throw new ApiError(payload?.error?.message ?? 'Something went wrong. Please try again.', {
      status: response.status,
      code: payload?.error?.code,
      details: payload?.error?.details,
    });
  }
  return payload;
}

export const apiGet = (path, options) => request('GET', path, options);
export const apiPost = (path, body, options) => request('POST', path, { ...options, body });
export const apiPut = (path, body, options) => request('PUT', path, { ...options, body });
