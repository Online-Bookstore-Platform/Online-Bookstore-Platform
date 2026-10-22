export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.error?.code || 'REQUEST_FAILED', body.error?.message || 'The request could not be completed.');
  return body;
}

export const getCurrentUser = () => apiRequest('/api/auth/me');
export const logout = () => apiRequest('/api/auth/logout', { method: 'POST' });
