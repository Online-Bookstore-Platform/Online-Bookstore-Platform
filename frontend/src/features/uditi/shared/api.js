/*
 * Small fetch client for Uditi's pages (catalogue, checkout, inventory).
 * Errors always become an ApiError with a message that is safe to show to a person;
 * `details` carries the per-field problems the backend reports for 400 responses.
 */

export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const FALLBACK_MESSAGES = {
  0: 'We couldn’t reach the server. Check your connection and try again.',
  429: 'Too many requests. Please wait a moment and try again.',
  502: 'A service we depend on sent an unexpected answer. Please try again shortly.',
  503: 'This part of the bookstore isn’t available right now. Please try again shortly.',
};

const fallbackMessage = status => FALLBACK_MESSAGES[status] || (status >= 500 ? 'Something went wrong on our side. Please try again.' : 'The request could not be completed.');

export const isAbort = error => error?.name === 'AbortError';

/**
 * @param {string} path  e.g. '/api/catalogue/books?page=2'
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal }} [options]
 */
export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', fallbackMessage(0));
  }
  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = payload?.error;
    throw new ApiError(
      response.status,
      problem?.code || 'REQUEST_FAILED',
      problem?.message || fallbackMessage(response.status),
      Array.isArray(problem?.details) ? problem.details : []
    );
  }
  return payload;
}

/** The signed-in user ({ id, name, email, role }) from Varchas's auth API, or null when signed out. */
export async function getSignedInUser(signal) {
  try {
    const result = await apiRequest('/api/auth/me', { signal });
    return result?.user ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const loginPath = next => `/login?next=${encodeURIComponent(next)}`;
